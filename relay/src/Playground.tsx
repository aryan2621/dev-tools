import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Braces,
  ChevronDown,
  LogIn,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Square,
  Wrench,
  RefreshCw,
  LoaderCircle,
  Play,
  Terminal,
  CircleSlash,
} from "lucide-react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "./api";
import {
  providers,
  type Catalog,
  type Server,
  type Provider,
  type Connection,
  type Step,
  type Call,
  type ToolOutput,
  type Trace,
  type Tool,
  toolResultTextForModel,
  type ToolCallResult,
  toolIsDestructive,
  toolAnnotations,
  extractJavaScriptBlocks,
  pretty,
} from "./types";
import { ToolResultView } from "./Inspector";
import { CopyButton, SpeakButton } from "./CopyButton";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader } from "./Sheet";
import { JavaScriptEditor } from "./JavaScriptEditor";
const RELAY_SEARCH = "relay_search_tools";
const RELAY_SCHEMA = "relay_get_tool_schema";
const RELAY_EXECUTE_JS = "relay_execute_javascript";
const PROGRESSIVE_AFTER = 10;
const SIGN_IN_REQUIRED = "SIGN_IN_REQUIRED";
const SANDBOX_DEFAULT =
  "// callTool(name, args) returns the tool's output and throws on failure.\n// Each call is approved in Relay. `return` the value you want to see.\nreturn { ok: true };";
// Links would navigate the app window away from Relay, and images would load from anywhere.
const markdownParts: Components = {
  a: ({ href, children }) => (
    <span className="markdown-link" title={href}>
      {children}
    </span>
  ),
  img: ({ alt }) => <>{alt}</>,
};
// Local reasoning models emit "<think>…</think>" (Qwen's template often pre-opens the tag, leaving only "</think>").
function splitThinking(text: string): { thinking: string; answer: string } {
  const end = text.lastIndexOf("</think>");
  if (end === -1) return { thinking: "", answer: text };
  return {
    thinking: text.slice(0, end).replace(/^\s*<think>/, "").trim(),
    answer: text.slice(end + "</think>".length).trim(),
  };
}
type BoundTool = {
  name: string;
  description: string;
  parameters: unknown;
  /** The tool's MCP outputSchema, when it declares one. */
  output?: unknown;
  serverId: string;
  toolName: string;
  serverName: string;
};
type ChatMessage = {
  role: string;
  text: string;
  detail?: unknown;
  /** Tool messages: the request arguments and the server that ran it. */
  args?: unknown;
  server?: string;
};

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  additionalProperties?: boolean | JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  enum?: unknown[];
  const?: unknown;
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
};

/** JSON Schema → a TypeScript type string, so the model sees the exact shape of args and results. */
function tsType(s: JsonSchema | undefined, defs: Record<string, JsonSchema>, depth = 0): string {
  if (!s || depth > 5) return "any";
  if (s.$ref) return tsType(defs[s.$ref.split("/").pop() ?? ""], defs, depth + 1);
  if (s.const !== undefined) return JSON.stringify(s.const);
  if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(" | ");
  const union = s.anyOf ?? s.oneOf;
  if (union) return union.map((u) => tsType(u, defs, depth + 1)).join(" | ");
  if (Array.isArray(s.type)) return s.type.map((t) => tsType({ ...s, type: t }, defs, depth)).join(" | ");
  switch (s.type) {
    case "integer":
    case "number":
      return "number";
    case "string":
    case "boolean":
    case "null":
      return s.type;
    case "array": {
      const item = tsType(s.items, defs, depth + 1);
      return item.includes(" ") && !item.startsWith("{") ? `(${item})[]` : `${item}[]`;
    }
  }
  if (s.properties) {
    const required = new Set(s.required ?? []);
    const fields = Object.entries(s.properties).map(
      ([k, v]) => `${k}${required.has(k) ? "" : "?"}: ${tsType(v, defs, depth + 1)}`,
    );
    return `{ ${fields.join("; ")} }`;
  }
  if (typeof s.additionalProperties === "object")
    return `Record<string, ${tsType(s.additionalProperties, defs, depth + 1)}>`;
  return s.type === "object" ? "Record<string, any>" : "any";
}

const scriptTools = (c: { arguments?: unknown }) => {
  const tools = (c.arguments as { tools?: unknown } | undefined)?.tools;
  return Array.isArray(tools) ? tools.filter((t): t is string => typeof t === "string") : [];
};

/** `name(args: {...}): {...}` with the tool's own input and output schemas. */
const toolSignature = (t: BoundTool) => {
  const input = (t.parameters ?? {}) as JsonSchema;
  const output = t.output as JsonSchema | undefined;
  const ret = output ? tsType(output, output.$defs ?? {}) : "unknown";
  return `${t.toolName}(args: ${tsType({ type: "object", ...input }, input.$defs ?? {})}): ${ret}`;
};

const relayJsTool = (tools: BoundTool[]): BoundTool => ({
  name: RELAY_EXECUTE_JS,
  description:
    "Run JavaScript in Relay's sandbox (QuickJS: no import/require, no fetch, no network). " +
    "The code is the body of an async function: write statements and `return` the value you want back (top-level `await` is fine). " +
    "callTool(toolName, args) is a global; args are the same object you would pass calling the tool directly. It returns the tool's output (its structured content, or its text parsed as JSON when possible) and throws on failure. " +
    "List every tool the script calls in `tools`. console.log output is returned as `logs`. " +
    "The signatures below are TypeScript: use exactly these argument names and read exactly these result fields. " +
    "When a result type is `unknown`, first return one raw result to see its shape. " +
    'Example: `const r = await callTool("some_tool", { limit: 5 }); return r;` ' +
    `Callable tools (? = optional):\n${tools.map(toolSignature).join("\n")}`,
  parameters: {
    type: "object",
    properties: {
      code: { type: "string", description: "JavaScript source to run." },
      tools: {
        type: "array",
        items: { type: "string" },
        description: "Tool names the script may pass to callTool.",
      },
    },
    required: ["code", "tools"],
  },
  serverId: "",
  toolName: "",
  serverName: "Relay",
});

type ApprovalView = {
  displayName: string;
  summary: string;
  argLine?: string;
  showArgs: boolean;
  relayMeta: boolean;
};

function approvalView(
  c: Call,
  t: BoundTool | undefined,
  connTool: Tool | undefined,
): ApprovalView {
  const args = c.arguments as Record<string, unknown> | undefined;
  if (c.name === RELAY_SEARCH) {
    const query = String(args?.query ?? "").trim();
    return {
      displayName: "relay_search_tools",
      summary: "Find MCP tools by keyword before the model calls one.",
      argLine: query ? `Search for “${query}”` : undefined,
      showArgs: false,
      relayMeta: true,
    };
  }
  if (c.name === RELAY_SCHEMA) {
    const name = String(args?.name ?? "").trim();
    return {
      displayName: "relay_get_tool_schema",
      summary: "Load the JSON schema for a tool the model plans to call.",
      argLine: name ? `Tool: ${name}` : undefined,
      showArgs: false,
      relayMeta: true,
    };
  }
  if (c.name === RELAY_EXECUTE_JS) {
    return {
      displayName: "relay_execute_javascript",
      summary: "Run approved JavaScript in Relay’s sandbox.",
      showArgs: true,
      relayMeta: true,
    };
  }
  const displayName = t?.toolName ?? c.name;
  const summary =
    (connTool?.description || t?.description || "").trim() ||
    "Runs on the connected MCP server with the arguments below.";
  const emptyArgs =
    !args ||
    (typeof args === "object" && Object.keys(args).length === 0);
  return {
    displayName,
    summary,
    showArgs: !emptyArgs,
    relayMeta: false,
  };
}

function parseToolMessage(text: string): {
  status: "executed" | "declined";
  toolName: string;
} {
  if (text.startsWith("Executed "))
    return { status: "executed", toolName: text.slice(9) };
  if (text.startsWith("Declined "))
    return { status: "declined", toolName: text.slice(9) };
  return { status: "executed", toolName: text };
}

function toolResultIsError(detail: unknown): boolean {
  if (!detail || typeof detail !== "object") return false;
  const d = detail as ToolCallResult & { error?: unknown };
  if (d.isError) return true;
  if ("error" in d && d.error) return true;
  return false;
}

function ToolResultMessage({
  text,
  detail,
  args,
  server,
  notify,
}: {
  text: string;
  detail?: unknown;
  notify: (text: string, error?: boolean) => void;
  args?: unknown;
  server?: string;
}) {
  const { status, toolName } = parseToolMessage(text);
  const declined = status === "declined";
  const errored = detail !== undefined && toolResultIsError(detail);
  const hasArgs =
    !!args && typeof args === "object" && Object.keys(args).length > 0;
  return (
    <details
      className={`mcp-call${declined ? " declined" : ""}${errored ? " errored" : ""}`}
    >
      <summary>
        <span className="mcp-call-icon" aria-hidden>
          {declined ? <CircleSlash size={13} /> : <Wrench size={13} />}
        </span>
        <span className="mcp-call-name">{toolName}</span>
        {server && <span className="mcp-call-server">{server}</span>}
        {(declined || errored) && (
          <span className="mcp-call-status">{declined ? "Denied" : "Error"}</span>
        )}
        <ChevronDown size={14} className="mcp-call-chevron" aria-hidden />
      </summary>
      <div className="mcp-call-body">
        {hasArgs && (
          <>
            <div className="mcp-call-label-row">
              <span className="mcp-call-label">Request</span>
              <CopyButton
                text={pretty(args)}
                label="Copy request"
                notify={notify}
              />
            </div>
            {typeof (args as { code?: unknown }).code === "string" ? (
              <>
                <pre className="mcp-call-code">
                  {(args as { code: string }).code}
                </pre>
                <pre className="mcp-call-code">
                  {pretty({ ...args, code: undefined })}
                </pre>
              </>
            ) : (
              <pre className="mcp-call-code">{pretty(args)}</pre>
            )}
          </>
        )}
        {detail !== undefined && (
          <>
            <div className="mcp-call-label-row">
              <span className="mcp-call-label">Response</span>
              <CopyButton
                text={pretty(detail)}
                label="Copy response"
                notify={notify}
              />
            </div>
            <div className="mcp-call-response">
              <ToolResultView value={detail} />
            </div>
          </>
        )}
      </div>
    </details>
  );
}

function approvalModalTitle(calls: Call[]): string {
  if (calls.length !== 1) return `Allow ${calls.length} tool calls?`;
  const only = calls[0];
  if (only.name === RELAY_SEARCH) return "Search MCP tools?";
  if (only.name === RELAY_SCHEMA) return "Load tool schema?";
  if (only.name === RELAY_EXECUTE_JS) return "Run sandbox code?";
  return "Allow tool call?";
}

export default function Playground({
  servers,
  connections,
  configured,
  catalog,
  visible,
  openModels,
  run,
  onError,
  notify,
  connectServer,
  signInServer,
  connecting,
  signingIn,
  serverErrors,
}: {
  servers: Server[];
  connections: Record<string, Connection>;
  configured: Provider[];
  catalog: Catalog | null;
  visible: boolean;
  openModels: () => void;
  run: (id: string, name: string, args: unknown) => Promise<Trace>;
  onError: (e: unknown) => void;
  notify: (text: string, error?: boolean) => void;
  connectServer: (s: Server) => Promise<string>;
  signInServer: (s: Server) => Promise<void>;
  connecting: string[];
  signingIn: string[];
  serverErrors: Record<string, string>;
}) {
  const [providerId, setProviderId] = useState("local"),
    [loading, setLoading] = useState(""),
    [input, setInput] = useState(""),
    [off, setOff] = useState<string[]>([]),
    [messages, setMessages] = useState<ChatMessage[]>([]),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<Call[]>([]),
    [retry, setRetry] = useState<{
      input: string;
      results: ToolOutput[];
    } | null>(null),
    [showTools, setShowTools] = useState(true),
    [round, setRound] = useState(0),
    [autoApproveReadOnly, setAutoApproveReadOnly] = useState(false),
    [codeMode, setCodeMode] = useState(false),
    [sandboxCode, setSandboxCode] = useState(SANDBOX_DEFAULT),
    [sandboxServer, setSandboxServer] = useState(""),
    [sandboxTool, setSandboxTool] = useState(""),
    [sandboxOpen, setSandboxOpen] = useState(false),
    [sandboxResult, setSandboxResult] = useState<{
      ok: boolean;
      value: unknown;
      ms: number;
    } | null>(null),
    [destructiveAck, setDestructiveAck] = useState(false),
    [playgroundServerId, setPlaygroundServerId] = useState("");
  const history = useRef<unknown[]>([]),
    bound = useRef<BoundTool[]>([]),
    fullCatalog = useRef<BoundTool[]>([]),
    progressive = useRef(false),
    alwaysAllowed = useRef(new Set<string>()),
    request = useRef(""),
    end = useRef<HTMLDivElement>(null);
  /** Bound tool by model-facing name; in progressive mode, any catalog tool the model discovered. */
  const findBound = (name: string) =>
    bound.current.find((x) => x.name === name) ??
    (progressive.current
      ? fullCatalog.current.find((x) => x.name === name)
      : undefined);
  const connectedCount = Object.keys(connections).length;
  const connectedServers = servers.filter((s) => connections[s.id]);
  const serverTools =
    playgroundServerId && connections[playgroundServerId]
      ? connections[playgroundServerId].tools.map((t) => ({
          key: `${playgroundServerId}:${t.name}`,
          serverId: playgroundServerId,
          toolName: t.name,
          serverName:
            servers.find((s) => s.id === playgroundServerId)?.name ??
            playgroundServerId,
          description: t.description ?? "",
          parameters: t.inputSchema,
          output: t.outputSchema,
        }))
      : [];
  const enabledCount = serverTools.filter((t) => !off.includes(t.key)).length;
  const sandboxTools = connections[sandboxServer]?.tools ?? [];
  const sandboxToolMeta = sandboxTools.find((t) => t.name === sandboxTool);
  const runSandbox = async () => {
                    setBusy(true);
                    setSandboxResult(null);
                    const t0 = performance.now();
                    try {
                      const value = await api("run_sandbox_code", {
                        serverId: sandboxServer,
                        toolName: sandboxTool,
                        code: sandboxCode,
                      });
                      setSandboxResult({
                        ok: true,
                        value,
                        ms: performance.now() - t0,
                      });
                      add({ role: "tool", text: "Sandbox run", detail: value, server: "Relay sandbox" });
                    } catch (e) {
                      setSandboxResult({
                        ok: false,
                        value: String(e),
                        ms: performance.now() - t0,
                      });
                    } finally {
                      setBusy(false);
                    }
  };
  const openSandbox = (code?: string) => {
    if (code) setSandboxCode(code);
    if (playgroundServerId && connections[playgroundServerId]) {
      setSandboxServer(playgroundServerId);
      const first = connections[playgroundServerId].tools[0];
      if (first) setSandboxTool(first.name);
    } else {
      const firstTool = serverTools[0];
      if (firstTool) {
        setSandboxServer(firstTool.serverId);
        setSandboxTool(firstTool.toolName);
      }
    }
    setSandboxResult(null);
    setSandboxOpen(true);
  };
  // Every model that's ready to use: the one picked on this Mac, and each saved API key.
  const choices = configured
    .map((p) => {
      if (p.id !== "local")
        return {
          id: p.id,
          label: `${providers.find((x) => x.id === p.id)?.name} · ${p.model}`,
        };
      const m = catalog?.models.find((m) => m.id === p.model && m.installed);
      return m && { id: p.id, label: `${m.name} · on this Mac` };
    })
    .filter((c) => !!c);
  const locked = messages.length > 0,
    provider = choices.find((c) => c.id === providerId),
    local = providerId === "local",
    localModel = configured.find((p) => p.id === "local")?.model ?? "";
  const pendingHasDestructive = pending.some((c) => {
    // A script is as risky as the tools it may call; read-only tools don't need the warning.
    if (c.name === RELAY_EXECUTE_JS)
      return scriptTools(c).some((name) => {
        const ct = connections[playgroundServerId]?.tools.find((x) => x.name === name);
        return !ct || toolIsDestructive(ct) || !toolAnnotations(ct)?.readOnlyHint;
      });
    const t = findBound(c.name);
    const ct = connections[t?.serverId ?? ""]?.tools.find(
      (x) => x.name === t?.toolName,
    );
    return toolIsDestructive(ct);
  });
  const pendingViews = pending.map((c) => {
    const t = findBound(c.name);
    const connTool = connections[t?.serverId ?? ""]?.tools.find(
      (x) => x.name === t?.toolName,
    );
    return { c, connTool, view: approvalView(c, t, connTool) };
  });
  const approvalServer =
    servers.find((x) => x.id === playgroundServerId)?.name ?? "your MCP server";
  // "Allow always" is for ordinary MCP tools only; destructive and sandbox calls always ask.
  const canAlwaysAllow =
    pending.length > 0 &&
    !pendingHasDestructive &&
    pendingViews.every(({ view }) => !view.relayMeta);
  useEffect(() => {
    setDestructiveAck(false);
  }, [pending]);
  useEffect(() => {
    const ids = Object.keys(connections);
    if (!ids.length) {
      setPlaygroundServerId("");
      return;
    }
    if (!playgroundServerId || !connections[playgroundServerId]) {
      setPlaygroundServerId(ids[0]);
    }
  }, [connections, playgroundServerId]);
  useEffect(() => {
    if (locked) return;
    setOff([]);
  }, [playgroundServerId, locked]);
  // Follow whichever model is actually set up, preferring the one on this Mac.
  useEffect(() => {
    if (!locked && !provider && choices.length) setProviderId(choices[0].id);
  }, [choices, provider, locked]);
  // Load the local model when the Playground opens, so the first reply doesn't wait for it.
  useEffect(() => {
    if (!visible || !local || !provider || !localModel) return;
    let cancelled = false;
    setLoading(localModel);
    api("warm_model", { id: localModel })
      .catch((e) => !cancelled && onError(e))
      .finally(() => !cancelled && setLoading(""));
    return () => {
      cancelled = true;
    };
  }, [visible, local, !!provider, localModel, onError]);
  const add = (m: ChatMessage) => {
    setMessages((v) => [...v, m]);
    setTimeout(
      () => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }),
      40,
    );
  };
  // `round` is stale inside step/approve closures; this ref carries the live count for auto-approve.
  const roundRef = useRef(0);
  const step = async (text: string, results: ToolOutput[] = []) => {
    const id = crypto.randomUUID();
    request.current = id;
    setBusy(true);
    setRetry(null);
    try {
      const mcpInstructions =
        playgroundServerId && connections[playgroundServerId]
          ? connections[playgroundServerId].info.instructions
          : undefined;
      const r = await api<Step>("ai_step", {
        requestId: id,
        providerId,
        history: history.current,
        input: text,
        results,
        tools: bound.current.map(({ name, description, parameters }) => ({
          name,
          description,
          parameters,
        })),
        mcpInstructions: mcpInstructions?.trim() || undefined,
      });
      history.current = r.history;
      setPending(r.calls);
      setRound((n) => n + 1);
      roundRef.current += 1;
      const allowedAlways =
        r.calls.length > 0 &&
        r.calls.every((c) => alwaysAllowed.current.has(c.name));
      // Auto-approval stops at the same 12-round cap as the buttons, so a looping model can't run unattended.
      const auto =
        roundRef.current < 12 &&
        (allowedAlways ||
        (autoApproveReadOnly &&
        r.calls.length > 0 &&
        r.calls.every((c) => {
          if (
            c.name === RELAY_SEARCH ||
            c.name === RELAY_SCHEMA ||
            c.name === RELAY_EXECUTE_JS
          )
            return false;
          const t = findBound(c.name);
          if (!t?.serverId) return false;
          const ct = connections[t.serverId]?.tools.find(
            (x) => x.name === t.toolName,
          );
          return (
            !!toolAnnotations(ct)?.readOnlyHint &&
            !toolIsDestructive(ct)
          );
        })));
      // Pass the calls explicitly: `pending` in approve's closure is still the old (empty) state.
      if (auto) queueMicrotask(() => void approve(true, r.calls));
      if (r.text) add({ role: "assistant", text: r.text });
      if (!r.text && !r.calls.length)
        add({
          role: "assistant",
          text: "The model returned no text or tool calls.",
        });
    } catch (e) {
      onError(e);
      setRetry({ input: text, results });
      add({ role: "error", text: String(e) });
    } finally {
      setBusy(false);
      request.current = "";
    }
  };
  const send = async () => {
    if (!input.trim() || busy || pending.length || retry) return;
    if (!playgroundServerId || !connections[playgroundServerId]) {
      onError("Connect and select an MCP server in the Playground sidebar.");
      return;
    }
    const text = input.trim();
    setInput("");
    if (!locked) {
      const used = new Set<string>();
      fullCatalog.current = serverTools
        .filter((t) => !off.includes(t.key))
        .map((t) => {
          const base =
            t.toolName.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60) || "tool";
          let name = base;
          for (let n = 2; used.has(name); n++) name = `${base}_${n}`;
          used.add(name);
          return {
            ...t,
            name,
            description: t.description || t.toolName,
          };
        });
      if (
        providerId !== "local" &&
        fullCatalog.current.length > PROGRESSIVE_AFTER
      ) {
        progressive.current = true;
        bound.current = [
          {
            name: RELAY_SEARCH,
            description:
              "Search connected MCP tools by keyword before calling them.",
            parameters: {
              type: "object",
              properties: { query: { type: "string" } },
              required: ["query"],
            },
            serverId: "",
            toolName: "",
            serverName: "Relay",
          },
          {
            name: RELAY_SCHEMA,
            description:
              "Load the JSON Schema for a tool name returned by relay_search_tools. After loading, that tool becomes callable.",
            parameters: {
              type: "object",
              properties: { name: { type: "string" } },
              required: ["name"],
            },
            serverId: "",
            toolName: "",
            serverName: "Relay",
          },
        ];
      } else {
        progressive.current = false;
        bound.current = fullCatalog.current;
      }
      if (codeMode) bound.current = [
          ...bound.current,
          relayJsTool(fullCatalog.current),
        ];
    }
    add({ role: "user", text });
    await step(text);
  };
  const approve = async (allow: boolean, calls: Call[] = [...pending]) => {
    if (!calls.length) return;
    setBusy(true);
    setPending([]);
    const outputs: ToolOutput[] = [];
    for (const c of calls) {
      const t = findBound(c.name);
      let value: unknown;
      if (!allow) value = { error: "The user declined this tool call." };
      else if (progressive.current && c.name === RELAY_SEARCH) {
        const q = String(
          (c.arguments as { query?: string })?.query ?? "",
        ).toLowerCase();
        value = fullCatalog.current
          .filter(
            (t) =>
              !q ||
              t.name.toLowerCase().includes(q) ||
              t.toolName.toLowerCase().includes(q) ||
              t.description.toLowerCase().includes(q),
          )
          .slice(0, 25)
          .map((t) => ({
            name: t.name,
            server: t.serverName,
            tool: t.toolName,
            description: t.description,
          }));
      } else if (c.name === RELAY_EXECUTE_JS) {
        const args = c.arguments as { code?: string; tools?: string[] };
        // Only tools enabled for this session, the same list the model was told about.
        const known = fullCatalog.current.map((t) => t.toolName);
        const tools = (args.tools ?? []).filter((n) => known.includes(n));
        if (!allow)
          value = { error: "The user declined this tool call." };
        else if (!args.code)
          value = { error: "code is required." };
        else if (!tools.length)
          value = {
            error: `Pass \`tools\` with at least one of: ${known.join(", ")}.`,
          };
        else
          try {
            value = await api("run_sandbox_code", {
              serverId: playgroundServerId,
              toolName: tools[0],
              allowedTools: tools,
              code: args.code,
            });
          } catch (e) {
            value = { error: String(e) };
          }
      } else if (progressive.current && c.name === RELAY_SCHEMA) {
        const want = String((c.arguments as { name?: string })?.name ?? "");
        const hit = fullCatalog.current.find((t) => t.name === want);
        // Expose the loaded tool to the model on the next turn so it can call it.
        if (hit && !bound.current.some((t) => t.name === hit.name))
          bound.current = [...bound.current, hit];
        value = hit
          ? {
              name: hit.name,
              server: hit.serverName,
              tool: hit.toolName,
              parameters: hit.parameters,
            }
          : { error: `Unknown tool name "${want}".` };
      } else if (!t)
        value = { error: "The model requested a tool that was not enabled." };
      else {
        try {
          const trace = await run(t.serverId, t.toolName, c.arguments);
          value = trace.result;
        } catch (e) {
          value = { error: String(e) };
        }
      }
      add({
        role: "tool",
        text: `${allow ? "Executed" : "Declined"} ${t?.toolName ?? c.name}`,
        detail: value,
        args: c.arguments,
        server: t?.serverName || (c.name.startsWith("relay_") ? "Relay" : undefined),
      });
      outputs.push({ id: c.id, content: toolResultTextForModel(value) });
    }
    await step("", outputs);
  };
  const reset = () => {
    history.current = [];
    bound.current = [];
    alwaysAllowed.current = new Set();
    setMessages([]);
    setPending([]);
    setRetry(null);
    setRound(0);
    roundRef.current = 0;
  };
  return (
    <div className="playground panel">
      <div className="playground-top">
        <div className="inline">
          <Sparkles size={17} />
          {choices.length ? (
            <select
              aria-label="Model"
              value={providerId}
              disabled={locked || busy}
              onChange={(e) => setProviderId(e.target.value)}
            >
              {choices.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          ) : (
            <button className="text-button" onClick={openModels}>
              Set up a model
            </button>
          )}
          {local && loading && (
            <span className="model-label">
              <LoaderCircle size={13} className="spin" /> Loading model…
            </span>
          )}
        </div>
        {connections[playgroundServerId] && (
          <span className="pg-context" title="MCP server and enabled tools">
            <span className="pg-context-dot" />
            {servers.find((x) => x.id === playgroundServerId)?.name ??
              "MCP server"}
            <span className="pg-context-sep">·</span>
            {enabledCount} {enabledCount === 1 ? "tool" : "tools"}
            {codeMode && (
              <>
                <span className="pg-context-sep">·</span>code mode
              </>
            )}
          </span>
        )}
        <button className="button small" disabled={busy} onClick={reset}>
          <RotateCcw size={14} /> New session
        </button>
      </div>
      <div className="playground-body">
        <div className="chat">
          <div className="chat-messages">
            {!messages.length ? (
              <div className="chat-welcome">
                <h2>How does a model use your tools?</h2>
                {choices.length ? (
                  <>
                    <p>
                      Give the model a task that needs your tools. You approve
                      every tool call before it runs.
                    </p>
                    <div className="suggestions">
                      {[
                        "What can the connected tools do?",
                        "Try each tool once with sensible inputs.",
                        "Which tool would you use first, and why?",
                      ].map((t) => (
                        <button key={t} onClick={() => setInput(t)}>
                          {t}
                          <ArrowUp size={14} />
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <p>
                      First pick a model: download one to run free on this Mac,
                      or add an API key.
                    </p>
                    <button className="button primary" onClick={openModels}>
                      Set up a model
                    </button>
                  </>
                )}
              </div>
            ) : (
              messages.map((m, i) => (
                <article key={i} className={`chat-message ${m.role}`}>
                  {m.role !== "tool" && (
                    <span className="message-role">
                      {m.role === "user"
                        ? "You"
                        : m.role === "assistant"
                          ? "Model"
                          : "Request failed"}
                    </span>
                  )}
                  {m.role === "assistant" ? (
                    <>
                      {(() => {
                        const { thinking, answer } = splitThinking(m.text);
                        return (
                          <>
                            {thinking && (
                              <details className="pg-thinking">
                                <summary>Thinking</summary>
                                <p>{thinking}</p>
                              </details>
                            )}
                            {answer && (
                              <div className="markdown">
                                <Markdown
                                  remarkPlugins={[remarkGfm]}
                                  components={markdownParts}
                                >
                                  {answer}
                                </Markdown>
                              </div>
                            )}
                            {answer && (
                              <div className="message-actions">
                                <CopyButton text={answer} notify={notify} />
                                <SpeakButton text={answer} />
                              </div>
                            )}
                          </>
                        );
                      })()}
                      {extractJavaScriptBlocks(splitThinking(m.text).answer).map((block, bi) => (
                        <div className="js-block-offer" key={bi}>
                          <p className="hint">JavaScript from the model</p>
                          <pre className="result-code">{block.slice(0, 800)}</pre>
                          <button
                            type="button"
                            className="button small"
                            disabled={busy}
                            onClick={() => openSandbox(block)}
                          >
                            Load into sandbox
                          </button>
                        </div>
                      ))}
                    </>
                  ) : m.role === "tool" ? (
                    <ToolResultMessage
                      text={m.text}
                      detail={m.detail}
                      args={m.args}
                      server={m.server}
                      notify={notify}
                    />
                  ) : (
                    <div>{m.text}</div>
                  )}
                </article>
              ))
            )}
            {!!pending.length && !busy && (
              <div>
                <section
                  className="tool-approval"
                  role="group"
                  aria-labelledby="tool-approval-title"
                >
                  <div className="tool-approval-main">
                    <span className="tool-approval-icon" aria-hidden>
                      <Wrench size={17} />
                    </span>
                    <div className="tool-approval-text">
                      <h2 id="tool-approval-title">
                        {pendingViews.length === 1 ? (
                          pendingViews[0].view.relayMeta ? (
                            approvalModalTitle(pending)
                          ) : (
                            <>
                              Allow the model to use{" "}
                              <code>{pendingViews[0].view.displayName}</code> from{" "}
                              <strong>{approvalServer}</strong>?
                            </>
                          )
                        ) : (
                          <>
                            Allow the model to use {pendingViews.length} tools from{" "}
                            <strong>{approvalServer}</strong>?
                          </>
                        )}
                      </h2>
                      {pendingViews.length === 1 && pendingViews[0].view.argLine && (
                        <p>{pendingViews[0].view.argLine}</p>
                      )}
                    </div>
                  </div>
                  <div className="tool-approval-calls">
                    {pendingViews.map(({ c, view, connTool }) => {
                      if (c.name === RELAY_EXECUTE_JS) {
                        const code = (c.arguments as { code?: unknown } | undefined)?.code;
                        return (
                          <div className="tool-approval-script" key={c.id}>
                            <div className="tool-approval-script-head">
                              <span className="badge accent">JavaScript</span>
                              <span>can call</span>
                              {scriptTools(c).map((name) => (
                                <code key={name}>{name}</code>
                              ))}
                            </div>
                            <pre className="tool-approval-args">
                              {typeof code === "string" ? code : pretty(c.arguments)}
                            </pre>
                            <p className="hint">Each tool call the script makes asks again.</p>
                          </div>
                        );
                      }
                      const destructive = toolIsDestructive(connTool);
                      const hasArgs =
                        view.showArgs &&
                        !!c.arguments &&
                        Object.keys(c.arguments as object).length > 0;
                      return (
                        <details
                          className="tool-approval-call"
                          key={c.id}
                        >
                          <summary className={hasArgs ? undefined : "no-args"}>
                            <ChevronDown size={14} className="tool-approval-chevron" />
                            <code>{view.displayName}</code>
                            {destructive && (
                              <span className="badge destructive">Destructive</span>
                            )}
                            <span className="tool-approval-args-hint">
                              {hasArgs ? "Arguments" : "No arguments"}
                            </span>
                          </summary>
                          {hasArgs && (
                            <pre className="tool-approval-args">
                              {pretty(c.arguments)}
                            </pre>
                          )}
                        </details>
                      );
                    })}
                  </div>
                  {pendingHasDestructive && (
                    <label className="tool-approval-risk">
                      <input
                        type="checkbox"
                        checked={destructiveAck}
                        onChange={(e) => setDestructiveAck(e.target.checked)}
                      />
                      <span>I understand this may change or delete data.</span>
                    </label>
                  )}
                  {round >= 12 && (
                    <p className="hint tool-approval-limit">
                      Session limit reached. Start a new session to continue.
                    </p>
                  )}
                  <footer className="tool-approval-footer">
                    <button
                      type="button"
                      className="button"
                      disabled={busy || round >= 12}
                      onClick={() => approve(false)}
                    >
                      Deny
                    </button>
                    <span className="tool-approval-spacer" />
                    {canAlwaysAllow && (
                      <button
                        type="button"
                        className="button"
                        disabled={busy || round >= 12}
                        title="Don’t ask again for these tools in this session"
                        onClick={() => {
                          pending.forEach((c) => alwaysAllowed.current.add(c.name));
                          void approve(true);
                        }}
                      >
                        Allow always
                      </button>
                    )}
                    <button
                      type="button"
                      className="button primary"
                      disabled={
                        busy ||
                        round >= 12 ||
                        (pendingHasDestructive && !destructiveAck)
                      }
                      onClick={() => approve(true)}
                    >
                      {pending.length === 1 && pending[0].name === RELAY_SEARCH
                        ? "Search"
                        : "Allow once"}
                    </button>
                  </footer>
                </section>
              </div>
            )}
            {busy && (
              <div className="thinking">
                <span className="pulse" />{" "}
                {local && loading ? "Loading the model…" : "Thinking…"}
              </div>
            )}
            {retry && !busy && (
              <div className="retry">
                <p>
                  Retry the model request using the same recorded tool results.
                  Tools will not be executed again.
                </p>
                <button
                  className="button"
                  onClick={() => step(retry.input, retry.results)}
                >
                  <RefreshCw size={14} /> Retry request
                </button>
              </div>
            )}
            <div ref={end} />
          </div>
          <div className="composer-wrap">
            <div className="composer">
              <textarea
                aria-label="Message"
                placeholder={
                  provider
                    ? "Give your tools something to work on…"
                    : "Download a model or add an API key in Models to start…"
                }
                value={input}
                disabled={busy || !!pending.length || !!retry || round >= 12}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              {busy ? (
                <button
                  className="send-button"
                  aria-label="Stop generation"
                  onClick={() => {
                    if (request.current)
                      void api("cancel_request", { id: request.current }).catch(
                        onError,
                      );
                  }}
                >
                  <Square size={16} />
                </button>
              ) : (
                <button
                  className="send-button"
                  aria-label="Send message"
                  disabled={
                    !provider ||
                    !input.trim() ||
                    !!pending.length ||
                    !!retry ||
                    round >= 12
                  }
                  onClick={send}
                >
                  <ArrowUp size={18} />
                </button>
              )}
            </div>
            <div className="composer-caption">
              <span>
                {local
                  ? "Runs on this Mac · nothing is sent to an AI service"
                  : "Your messages and tool results are sent to your provider"}
              </span>
              <span>↵ Send</span>
            </div>
          </div>
        </div>
        <aside className="playground-tools">
          <section className="pg-section">
            <h3 className="pg-heading">MCP server</h3>
            {servers.length === 0 ? (
              <p className="hint">
                Add an MCP server under Servers, then connect it here.
              </p>
            ) : connectedCount === 0 ? (
              <>
                <p className="hint">
                  Connect a server to give the model its tools. Connections
                  don’t persist across restarts.
                </p>
                <ul className="playground-server-list">
                  {servers.map((s) => {
                    const loading = connecting.includes(s.id);
                    const waiting = signingIn.includes(s.id);
                    const needsSignIn =
                      serverErrors[s.id] === SIGN_IN_REQUIRED;
                    const failed =
                      !!serverErrors[s.id] && !needsSignIn;
                    return (
                      <li key={s.id}>
                        <span>
                          <strong>{s.name}</strong>
                          <small>
                            {loading
                              ? "Connecting…"
                              : needsSignIn
                                ? "Sign-in required"
                                : failed
                                  ? "Connection failed"
                                  : "Not connected"}
                          </small>
                        </span>
                        {needsSignIn && !connections[s.id] ? (
                          <button
                            type="button"
                            className="button small primary"
                            disabled={waiting || loading}
                            onClick={() => void signInServer(s)}
                          >
                            {waiting ? (
                              <LoaderCircle className="spin" size={14} />
                            ) : (
                              <LogIn size={14} />
                            )}{" "}
                            Sign in
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="button small primary"
                            disabled={loading || !!connections[s.id]}
                            onClick={() => void connectServer(s)}
                          >
                            {loading ? (
                              <LoaderCircle className="spin" size={14} />
                            ) : null}
                            Connect
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <select
                className="pg-server-select"
                aria-label="MCP server for this session"
                value={playgroundServerId}
                disabled={locked}
                onChange={(e) => setPlaygroundServerId(e.target.value)}
              >
                {connectedServers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </section>
          {connectedCount > 0 && (
            <section className="pg-section pg-tools-section">
              <button
                type="button"
                className="pg-heading pg-heading-toggle"
                aria-expanded={showTools}
                onClick={() => setShowTools(!showTools)}
              >
                <span>
                  <Braces size={14} /> Tools
                </span>
                <span className="pg-count">
                  {enabledCount}/{serverTools.length}
                </span>
                <ChevronDown
                  size={14}
                  className={showTools ? "pg-chevron open" : "pg-chevron"}
                />
              </button>
              {showTools &&
                (serverTools.length === 0 ? (
                  <p className="hint">
                    {playgroundServerId
                      ? "This server reported no tools. Try reconnecting from Servers."
                      : "Select a connected MCP server above."}
                  </p>
                ) : (
                  <>
                    {!locked && serverTools.length > 1 && (
                      <div className="pg-bulk">
                        <button
                          type="button"
                          className="text-button"
                          disabled={enabledCount === serverTools.length}
                          onClick={() =>
                            setOff((v) =>
                              v.filter((k) => !serverTools.some((t) => t.key === k)),
                            )
                          }
                        >
                          Enable all
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          disabled={enabledCount === 0}
                          onClick={() =>
                            setOff((v) => [
                              ...v,
                              ...serverTools
                                .map((t) => t.key)
                                .filter((k) => !v.includes(k)),
                            ])
                          }
                        >
                          Disable all
                        </button>
                      </div>
                    )}
                    <div className="pg-tool-list">
                      {serverTools.map((t) => (
                        <label className="tool-checkbox" key={t.key}>
                          <input
                            type="checkbox"
                            checked={!off.includes(t.key)}
                            disabled={locked}
                            onChange={(e) =>
                              // Tools start enabled; remember only the ones switched off.
                              setOff((v) =>
                                e.target.checked
                                  ? v.filter((k) => k !== t.key)
                                  : [...v, t.key],
                              )
                            }
                          />
                          <span>
                            <strong>{t.toolName}</strong>
                            {t.description && (
                              <small title={t.description}>
                                {t.description}
                              </small>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  </>
                ))}
            </section>
          )}
          <section className="pg-section">
            <h3 className="pg-heading">Session</h3>
            <label className="tool-checkbox">
              <input
                type="checkbox"
                checked={codeMode}
                disabled={locked}
                onChange={(e) => setCodeMode(e.target.checked)}
              />
              <span>
                <strong className="pg-option">Code mode</strong>
                <small>
                  Lets the model write JavaScript that calls your tools in a
                  sandbox. You approve each run.
                </small>
              </span>
            </label>
            <label className="tool-checkbox">
              <input
                type="checkbox"
                checked={autoApproveReadOnly}
                disabled={locked}
                onChange={(e) => setAutoApproveReadOnly(e.target.checked)}
              />
              <span>
                <strong className="pg-option">Auto-approve read-only</strong>
                <small>Skips approval for tools marked readOnlyHint.</small>
              </span>
            </label>
            <button
              type="button"
              className="button small pg-sandbox"
              disabled={!connectedCount}
              title={connectedCount ? undefined : "Connect a server first"}
              onClick={() => openSandbox()}
            >
              <Terminal size={14} /> Open JavaScript sandbox
            </button>
            {locked && (
              <p className="hint">
                Start a new session to change the model, server, or tools.
              </p>
            )}
          </section>
          <div className="approval-note">
            <ShieldCheck size={15} />
            <p>
              Every tool call waits for your approval. Destructive tools always
              ask, even with auto-approve on.
            </p>
          </div>
        </aside>
      </div>
      <Sheet open={sandboxOpen} onOpenChange={setSandboxOpen}>
          <SheetContent
            width="lg"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                if (sandboxServer && sandboxTool && !busy) void runSandbox();
              }
            }}
          >
            <SheetHeader
              title="JavaScript sandbox"
              description="QuickJS · no network · you approve each tool call"
            />
            <SheetBody>
              <div className="sandbox-notice">
                <ShieldCheck size={16} />
                <span>
                  The script can call only the tool selected below with{" "}
                  <code>callTool</code>. Every call still asks for your
                  approval.
                </span>
              </div>
              <div className="sandbox-config">
                <label>
                  <span className="sandbox-label">MCP server</span>
                  <select
                    aria-label="Sandbox server"
                    value={sandboxServer}
                    onChange={(e) => {
                      setSandboxServer(e.target.value);
                      setSandboxTool("");
                    }}
                  >
                    <option value="">Choose server…</option>
                    {Object.keys(connections).map((id) => (
                      <option key={id} value={id}>
                        {servers.find((s) => s.id === id)?.name ?? id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="sandbox-label">Allowed tool</span>
                  <select
                    aria-label="Sandbox tool"
                    value={sandboxTool}
                    disabled={!sandboxServer}
                    onChange={(e) => setSandboxTool(e.target.value)}
                  >
                    <option value="">Choose tool…</option>
                    {sandboxTools.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {sandboxToolMeta && (
                <div className="sandbox-tool-info">
                  <span
                    className={`sandbox-badge${
                      toolAnnotations(sandboxToolMeta)?.readOnlyHint
                        ? " read"
                        : " write"
                    }`}
                  >
                    {toolAnnotations(sandboxToolMeta)?.readOnlyHint
                      ? "Read-only"
                      : "Can change data"}
                  </span>
                  {sandboxToolMeta.description && (
                    <p className="sandbox-tool-desc">
                      {sandboxToolMeta.description}
                    </p>
                  )}
                </div>
              )}
              <div className="sandbox-editor-block">
                <div className="sandbox-editor-toolbar">
                  <span className="sandbox-editor-label">Script</span>
                  <div className="sandbox-editor-actions">
                    <button
                      type="button"
                      className="button small"
                      disabled={!sandboxTool}
                      onClick={() =>
                        setSandboxCode((c) =>
                          c.trim()
                            ? `${c.replace(/\s+$/, "")}\n\nconst result = callTool("${sandboxTool}", {});\nreturn result;\n`
                            : `const result = callTool("${sandboxTool}", {});\nreturn result;\n`,
                        )
                      }
                    >
                      Insert callTool
                    </button>
                    <button
                      type="button"
                      className="button small"
                      onClick={() => setSandboxCode(SANDBOX_DEFAULT)}
                    >
                      Reset template
                    </button>
                  </div>
                </div>
                <JavaScriptEditor
                  value={sandboxCode}
                  onChange={setSandboxCode}
                  toolNames={sandboxTools.map((t) => t.name)}
                  minHeight={220}
                />
                <p className="sandbox-editor-hint">
                  Tab · indent ·{" "}
                  <kbd>⌃</kbd>
                  <kbd>Space</kbd> · autocomplete · <kbd>⌘</kbd>
                  <kbd>↵</kbd> run · 30s run limit
                </p>
              </div>
              {sandboxResult && (
                <div
                  className={`sandbox-result${sandboxResult.ok ? "" : " error"}`}
                >
                  <div className="sandbox-result-head">
                    <span>{sandboxResult.ok ? "Result" : "Error"}</span>
                    <span className="sandbox-result-meta">
                      {(sandboxResult.ms / 1000).toFixed(2)}s
                      <CopyButton
                        text={
                          typeof sandboxResult.value === "string"
                            ? sandboxResult.value
                            : pretty(sandboxResult.value)
                        }
                        label="Copy result"
                        notify={notify}
                      />
                    </span>
                  </div>
                  <pre className="sandbox-result-body">
                    {typeof sandboxResult.value === "string"
                      ? sandboxResult.value
                      : pretty(sandboxResult.value)}
                  </pre>
                </div>
              )}
            </SheetBody>
            <SheetFooter>
                <button
                  type="button"
                  className="button"
                  onClick={() => setSandboxOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button primary"
                  disabled={!sandboxServer || !sandboxTool || busy}
                  onClick={runSandbox}
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <Play size={15} />
                  )}{" "}
                  Run sandbox
                </button>
            </SheetFooter>
          </SheetContent>
      </Sheet>
    </div>
  );
}
