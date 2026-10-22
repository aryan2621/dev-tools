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
  X,
  RefreshCw,
  LoaderCircle,
  Play,
  Terminal,
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
  toolIsDestructive,
  toolAnnotations,
  extractJavaScriptBlocks,
  pretty,
} from "./types";
import { ToolResultView } from "./Inspector";
import { JavaScriptEditor } from "./JavaScriptEditor";
const RELAY_SEARCH = "relay_search_tools";
const RELAY_SCHEMA = "relay_get_tool_schema";
const RELAY_EXECUTE_JS = "relay_execute_javascript";
const PROGRESSIVE_AFTER = 10;
const SIGN_IN_REQUIRED = "SIGN_IN_REQUIRED";
const SANDBOX_DEFAULT =
  "// callTool(name, { ...args }) — each call is approved in Relay.\nreturn { ok: true };";
// Links would navigate the app window away from Relay, and images would load from anywhere.
const markdownParts: Components = {
  a: ({ href, children }) => (
    <span className="markdown-link" title={href}>
      {children}
    </span>
  ),
  img: ({ alt }) => <>{alt}</>,
};
type BoundTool = {
  name: string;
  description: string;
  parameters: unknown;
  serverId: string;
  toolName: string;
  serverName: string;
};
type ChatMessage = { role: string; text: string; detail?: unknown };

const relayJsTool = (): BoundTool => ({
  name: RELAY_EXECUTE_JS,
  description:
    "Run JavaScript in Relay's QuickJS sandbox. callTool(toolName, args) may call only the toolName you pass here. Return a JSON-serializable value.",
  parameters: {
    type: "object",
    properties: {
      code: { type: "string", description: "JavaScript source to run." },
      serverId: {
        type: "string",
        description: "Connected server id (from Relay).",
      },
      toolName: {
        type: "string",
        description: "MCP tool name allowed for callTool inside the script.",
      },
    },
    required: ["code", "serverId", "toolName"],
  },
  serverId: "",
  toolName: "",
  serverName: "Relay",
});

export default function Playground({
  servers,
  connections,
  configured,
  catalog,
  visible,
  openModels,
  run,
  onError,
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
    [destructiveAck, setDestructiveAck] = useState(false),
    [playgroundServerId, setPlaygroundServerId] = useState("");
  const history = useRef<unknown[]>([]),
    bound = useRef<BoundTool[]>([]),
    fullCatalog = useRef<BoundTool[]>([]),
    progressive = useRef(false),
    request = useRef(""),
    end = useRef<HTMLDivElement>(null);
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
        }))
      : [];
  const sandboxTools = connections[sandboxServer]?.tools ?? [];
  const sandboxToolMeta = sandboxTools.find((t) => t.name === sandboxTool);
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
    if (c.name === RELAY_EXECUTE_JS) return true;
    const t = bound.current.find((x) => x.name === c.name);
    const ct = connections[t?.serverId ?? ""]?.tools.find(
      (x) => x.name === t?.toolName,
    );
    return toolIsDestructive(ct);
  });
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
  const step = async (text: string, results: ToolOutput[] = []) => {
    const id = crypto.randomUUID();
    request.current = id;
    setBusy(true);
    setRetry(null);
    try {
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
        progressive: progressive.current,
      });
      history.current = r.history;
      setPending(r.calls);
      setRound((n) => n + 1);
      const auto =
        autoApproveReadOnly &&
        r.calls.length > 0 &&
        r.calls.every((c) => {
          if (
            c.name === RELAY_SEARCH ||
            c.name === RELAY_SCHEMA ||
            c.name === RELAY_EXECUTE_JS
          )
            return false;
          const t = bound.current.find((x) => x.name === c.name);
          if (!t?.serverId) return false;
          const ct = connections[t.serverId]?.tools.find(
            (x) => x.name === t.toolName,
          );
          return (
            !!toolAnnotations(ct)?.readOnlyHint &&
            !toolIsDestructive(ct)
          );
        });
      if (auto) queueMicrotask(() => void approve(true));
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
      if (fullCatalog.current.length > PROGRESSIVE_AFTER) {
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
              "Load the JSON Schema for a tool name returned by relay_search_tools.",
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
      if (codeMode) bound.current = [...bound.current, relayJsTool()];
    }
    add({ role: "user", text });
    await step(text);
  };
  const approve = async (allow: boolean) => {
    setBusy(true);
    const calls = [...pending];
    setPending([]);
    const outputs: ToolOutput[] = [];
    for (const c of calls) {
      const t = bound.current.find((t) => t.name === c.name);
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
        const args = c.arguments as {
          code?: string;
          serverId?: string;
          toolName?: string;
        };
        if (!allow)
          value = { error: "The user declined this tool call." };
        else if (!args.code || !args.serverId || !args.toolName)
          value = { error: "code, serverId, and toolName are required." };
        else if (!connections[args.serverId])
          value = { error: "Unknown serverId." };
        else
          try {
            value = await api("run_sandbox_code", {
              serverId: args.serverId,
              toolName: args.toolName,
              code: args.code,
            });
          } catch (e) {
            value = { error: String(e) };
          }
      } else if (progressive.current && c.name === RELAY_SCHEMA) {
        const want = String((c.arguments as { name?: string })?.name ?? "");
        const hit = fullCatalog.current.find((t) => t.name === want);
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
      });
      outputs.push({ id: c.id, content: toolResultTextForModel(value) });
    }
    await step("", outputs);
  };
  const reset = () => {
    history.current = [];
    bound.current = [];
    setMessages([]);
    setPending([]);
    setRetry(null);
    setRound(0);
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
                  <span className="message-role">
                    {m.role === "user"
                      ? "You"
                      : m.role === "assistant"
                        ? "Model"
                        : m.role === "tool"
                          ? "Tool result"
                          : "Request failed"}
                  </span>
                  {m.role === "assistant" ? (
                    <>
                      <div className="markdown">
                        <Markdown
                          remarkPlugins={[remarkGfm]}
                          components={markdownParts}
                        >
                          {m.text}
                        </Markdown>
                      </div>
                      {extractJavaScriptBlocks(m.text).map((block, bi) => (
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
                  ) : (
                    <div>{m.text}</div>
                  )}
                  {m.detail !== undefined && (
                    <details>
                      <summary>View result</summary>
                      <ToolResultView value={m.detail} />
                    </details>
                  )}
                </article>
              ))
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
          <button
            className="tools-title"
            onClick={() => setShowTools(!showTools)}
          >
            <span>
              <Braces size={16} /> Available tools
            </span>
            <ChevronDown size={15} />
          </button>
          <p>Tools come from the MCP server you select below.</p>
          {connectedCount > 0 && (
            <label className="playground-server-select">
              <span>MCP server</span>
              <select
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
            </label>
          )}
          {showTools && (
            <>
              {serverTools.length === 0 ? (
                <div className="playground-connect">
                  {servers.length === 0 ? (
                    <p className="hint">
                      Add an MCP server under Servers, then connect it to list
                      tools here.
                    </p>
                  ) : connectedCount === 0 ? (
                    <>
                      <p className="hint">
                        Tools appear after you connect a server (Relay does not
                        keep connections open across restarts).
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
                  ) : playgroundServerId ? (
                    <p className="hint">
                      Connected, but this server reported no tools. Try
                      reconnecting from Servers.
                    </p>
                  ) : (
                    <p className="hint">Select a connected MCP server above.</p>
                  )}
                </div>
              ) : (
                serverTools.map((t) => (
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
                      <small>{t.serverName}</small>
                    </span>
                  </label>
                ))
              )}
            </>
          )}
          {locked && (
            <p className="hint">
              Start a new session to change the model, MCP server, or tools.
            </p>
          )}
          <label className="tool-checkbox">
            <input
              type="checkbox"
              checked={codeMode}
              disabled={locked}
              onChange={(e) => setCodeMode(e.target.checked)}
            />
            <span>
              <strong>Code mode</strong>
              <small>
                Offers relay_execute_javascript (sandbox; you approve each run)
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
              <strong>Auto-approve read-only tools</strong>
              <small>Only when the server marks them readOnlyHint</small>
            </span>
          </label>
          <button
            type="button"
            className="button small sandbox-open"
            disabled={!connectedCount}
            onClick={() => openSandbox()}
          >
            JavaScript sandbox
          </button>
          {!connectedCount && (
            <p className="hint sandbox-hint">
              Connect a server above to run sandbox code.
            </p>
          )}
          <div className="approval-note">
            <ShieldCheck size={17} />
            <strong>You’re in control</strong>
            <p>
              Tool calls require approval unless auto-approve is on for read-only
              tools. Destructive hints always need a click.
            </p>
          </div>
        </aside>
      </div>
      {!!pending.length && (
        <div className="modal-backdrop tool-approval-backdrop">
          <section
            className="modal tool-approval-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tool-approval-title"
          >
            <header className="tool-approval-header">
              <ShieldCheck size={22} aria-hidden />
              <div>
                <h2 id="tool-approval-title">
                  {pending.length === 1
                    ? "Allow tool call?"
                    : `Allow ${pending.length} tool calls?`}
                </h2>
                <p>
                  {playgroundServerId
                    ? (servers.find((s) => s.id === playgroundServerId)?.name ??
                      "MCP server")
                    : "Your MCP server"}
                </p>
              </div>
            </header>
            <div className="modal-body tool-approval-body">
              {pending.map((c) => {
                const t = bound.current.find((bt) => bt.name === c.name);
                const connTool = connections[t?.serverId ?? ""]?.tools.find(
                  (x: Tool) => x.name === t?.toolName,
                );
                const displayName =
                  c.name === RELAY_SEARCH
                    ? "relay_search_tools"
                    : c.name === RELAY_SCHEMA
                      ? "relay_get_tool_schema"
                      : c.name === RELAY_EXECUTE_JS
                        ? "relay_execute_javascript"
                        : (t?.toolName ?? c.name);
                return (
                  <div className="tool-approval-item" key={c.id}>
                    <div className="tool-approval-item-head">
                      <code>{displayName}</code>
                      <span className="tool-approval-badges">
                        {c.name === RELAY_EXECUTE_JS && (
                          <span className="badge destructive">Sandbox</span>
                        )}
                        {toolIsDestructive(connTool) && (
                          <span className="badge destructive">Destructive</span>
                        )}
                        {toolAnnotations(connTool)?.readOnlyHint && (
                          <span className="badge">Read-only</span>
                        )}
                      </span>
                    </div>
                    <pre className="tool-approval-args">
                      {pretty(c.arguments)}
                    </pre>
                  </div>
                );
              })}
              {pendingHasDestructive && (
                <label className="tool-approval-risk">
                  <input
                    type="checkbox"
                    checked={destructiveAck}
                    onChange={(e) => setDestructiveAck(e.target.checked)}
                  />
                  <span>This may change or delete data on connected servers.</span>
                </label>
              )}
              {round >= 12 && (
                <p className="hint">
                  Session limit reached. Start a new session to continue.
                </p>
              )}
            </div>
            <footer>
              <button
                type="button"
                className="button"
                disabled={busy || round >= 12}
                onClick={() => approve(false)}
              >
                Deny
              </button>
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
                Allow
              </button>
            </footer>
          </section>
        </div>
      )}
      {sandboxOpen && (
        <div
          className="modal-backdrop sandbox-backdrop"
          onClick={(e) => e.target === e.currentTarget && setSandboxOpen(false)}
        >
          <section
            className="modal sandbox-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sandbox-title"
          >
            <header className="sandbox-modal-header">
              <div className="sandbox-modal-title">
                <span className="sandbox-modal-icon" aria-hidden>
                  <Terminal size={20} />
                </span>
                <div>
                  <h2 id="sandbox-title">JavaScript sandbox</h2>
                  <p>QuickJS · no network · you approve each tool call</p>
                </div>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Close"
                onClick={() => setSandboxOpen(false)}
              >
                <X size={18} />
              </button>
            </header>
            <div className="modal-body sandbox-modal-body">
              <div className="sandbox-notice">
                <ShieldCheck size={16} />
                <span>
                  Bind one allowed tool for <code>callTool</code>. Extra calls
                  from the script still go through the approval dialog.
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
              {sandboxToolMeta?.description && (
                <p className="sandbox-tool-desc">{sandboxToolMeta.description}</p>
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
                            ? `${c.replace(/\s+$/, "")}\n\ncallTool("${sandboxTool}", {});\n`
                            : `callTool("${sandboxTool}", {});\nreturn {};\n`,
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
                  minHeight={340}
                />
                <p className="sandbox-editor-hint">
                  Tab · indent ·{" "}
                  <kbd>⌃</kbd>
                  <kbd>Space</kbd> · autocomplete · 30s run limit
                </p>
              </div>
            </div>
            <footer className="sandbox-footer">
              <p className="sandbox-footer-meta">
                {sandboxServer && sandboxTool ? (
                  <>
                    Ready on{" "}
                    <strong>
                      {servers.find((s) => s.id === sandboxServer)?.name}
                    </strong>{" "}
                    · <code>{sandboxTool}</code>
                  </>
                ) : (
                  "Pick a server and tool to run"
                )}
              </p>
              <div className="sandbox-footer-actions">
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
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const detail = await api("run_sandbox_code", {
                        serverId: sandboxServer,
                        toolName: sandboxTool,
                        code: sandboxCode,
                      });
                      add({ role: "tool", text: "Sandbox finished", detail });
                      setSandboxOpen(false);
                    } catch (e) {
                      onError(e);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <Play size={15} />
                  )}{" "}
                  Run sandbox
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
