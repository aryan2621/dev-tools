import {
  Fragment,
  forwardRef,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { listen } from "@tauri-apps/api/event";
import {
  Braces,
  Play,
  Save,
  Search,
  FileText,
  MessageSquare,
  Copy,
  Check,
  ScrollText,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { api } from "./api";
import {
  type Server,
  type Connection,
  type Trace,
  type TestCase,
  type Tool,
  type ToolCallResult,
  type ContentPart,
  pretty,
  parseObject,
  validateOutputSchema,
  wrapMcpAppDocument,
} from "./types";

type AppToolCallRequest = {
  requestId: string;
  toolName: string;
  arguments: unknown;
};

const McpAppFrame = forwardRef<
  HTMLIFrameElement,
  {
    serverId: string;
    uri: string;
    initialHtml?: string;
    structuredContent?: unknown;
    toolInput?: unknown;
    onAppToolCall?: (req: AppToolCallRequest) => void;
  }
>(function McpAppFrame(
  {
    serverId,
    uri,
    initialHtml,
    structuredContent,
    toolInput,
    onAppToolCall,
  },
  frameRef,
) {
  const localFrame = useRef<HTMLIFrameElement>(null);
  const setFrameEl = (el: HTMLIFrameElement | null) => {
    localFrame.current = el;
    if (typeof frameRef === "function") frameRef(el);
    else if (frameRef) frameRef.current = el;
  };
  const [html, setHtml] = useState(initialHtml ?? "");
  useEffect(() => {
    if (initialHtml) {
      setHtml(initialHtml);
      return;
    }
    if (!uri.startsWith("ui://")) return;
    let cancelled = false;
    void api<{ contents?: { text?: string }[] }>("read_resource", {
      id: serverId,
      uri,
    })
      .then((r) => {
        if (!cancelled) setHtml(r.contents?.[0]?.text ?? "");
      })
      .catch(() => {
        if (!cancelled) setHtml("");
      });
    return () => {
      cancelled = true;
    };
  }, [serverId, uri, initialHtml]);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== localFrame.current?.contentWindow) return;
      if (e.data?.type === "relay-app-ready") {
        localFrame.current?.contentWindow?.postMessage(
          {
            type: "relay-app-init",
            structuredContent,
            toolInput,
            uri,
          },
          "*",
        );
        return;
      }
      if (e.data?.type === "relay-app-tool-call" && onAppToolCall) {
        onAppToolCall({
          requestId: String(e.data.requestId ?? ""),
          toolName: String(e.data.toolName ?? ""),
          arguments: e.data.arguments ?? {},
        });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [html, structuredContent, toolInput, uri, onAppToolCall]);
  if (!html)
    return <p className="hint">Could not load MCP App HTML for {uri}.</p>;
  return (
    <>
      <p className="hint">
        MCP App runs isolated. Tool calls use{" "}
        <code>relay-app-tool-call</code> and require your approval.
      </p>
      <iframe
        ref={setFrameEl}
        title="MCP App"
        className="mcp-app-frame"
        sandbox="allow-scripts"
        srcDoc={wrapMcpAppDocument(html)}
      />
    </>
  );
});

type FieldSchema = {
  type?: string;
  description?: string;
  enum?: unknown[];
  properties?: Record<string, FieldSchema>;
  required?: string[];
  items?: FieldSchema;
};

function SchemaFieldEditor({
  label,
  schema,
  required: isRequired,
  value,
  onChange,
  disabled,
  depth = 0,
}: {
  label: string;
  schema: FieldSchema;
  required?: boolean;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled: boolean;
  depth?: number;
}) {
  if (depth > 4)
    return <p className="hint">Nested too deeply — use JSON editor.</p>;
  if (schema.enum?.length) {
    return (
      <label>
        {label}
        {isRequired ? " *" : ""}
        {schema.description && (
          <span className="hint block">{schema.description}</span>
        )}
        <select
          value={value === undefined ? "" : String(value)}
          disabled={disabled}
          onChange={(e) =>
            onChange(e.target.value === "" ? undefined : e.target.value)
          }
        >
          <option value="">—</option>
          {schema.enum.map((opt) => (
            <option key={String(opt)} value={String(opt)}>
              {String(opt)}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (
    schema.type === "object" ||
    (schema.properties && Object.keys(schema.properties).length)
  ) {
    const obj =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    const req = new Set(schema.required ?? []);
    return (
      <fieldset className="schema-nested">
        <legend>
          {label}
          {isRequired ? " *" : ""}
        </legend>
        {schema.description && (
          <span className="hint block">{schema.description}</span>
        )}
        {Object.entries(schema.properties ?? {}).map(([k, sub]) => (
          <SchemaFieldEditor
            key={k}
            label={k}
            schema={sub}
            required={req.has(k)}
            value={obj[k]}
            onChange={(v) => onChange({ ...obj, [k]: v })}
            disabled={disabled}
            depth={depth + 1}
          />
        ))}
      </fieldset>
    );
  }
  if (schema.type === "array") {
    const arr = Array.isArray(value) ? [...value] : [];
    const itemSchema = schema.items ?? { type: "string" };
    return (
      <div className="schema-array">
        <span className="section-label">
          {label}
          {isRequired ? " *" : ""}
        </span>
        {arr.map((item, i) => (
          <div key={i} className="schema-array-row">
            <SchemaFieldEditor
              label={`Item ${i + 1}`}
              schema={itemSchema}
              value={item}
              onChange={(v) => {
                const next = [...arr];
                next[i] = v;
                onChange(next);
              }}
              disabled={disabled}
              depth={depth + 1}
            />
            <button
              type="button"
              className="text-button"
              disabled={disabled}
              onClick={() => onChange(arr.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="text-button"
          disabled={disabled}
          onClick={() =>
            onChange([
              ...arr,
              itemSchema.type === "boolean"
                ? false
                : itemSchema.type === "number" || itemSchema.type === "integer"
                  ? 0
                  : "",
            ])
          }
        >
          Add item
        </button>
      </div>
    );
  }
  if (schema.type === "boolean") {
    return (
      <label>
        {label}
        {isRequired ? " *" : ""}
        <input
          type="checkbox"
          checked={!!value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
      </label>
    );
  }
  if (schema.type === "number" || schema.type === "integer") {
    return (
      <label>
        {label}
        {isRequired ? " *" : ""}
        <input
          type="number"
          value={Number(value ?? 0)}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </label>
    );
  }
  return (
    <label>
      {label}
      {isRequired ? " *" : ""}
      {schema.description && (
        <span className="hint block">{schema.description}</span>
      )}
      <input
        value={value === undefined ? "" : String(value)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function CatalogArgumentEditor({
  serverId,
  tab,
  itemName,
  uriTemplate,
  argumentDefs,
  value,
  onChange,
  disabled,
  onError,
}: {
  serverId: string;
  tab: string;
  itemName: string;
  uriTemplate?: string;
  argumentDefs: { name: string; description?: string; required?: boolean }[];
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  disabled: boolean;
  onError: (e: unknown) => void;
}) {
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});
  const reference =
    tab === "prompts"
      ? { type: "ref/prompt", name: itemName }
      : {
          type: "ref/resource",
          uriTemplate: uriTemplate ?? itemName,
        };
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const complete = useCallback(
    async (argName: string) => {
      const argValue = value[argName] ?? "";
      const context = {
        arguments: Object.fromEntries(
          Object.entries(value).filter(([k]) => k !== argName),
        ),
      };
      try {
        const completion = await api<{ values?: string[] }>("complete_argument", {
          id: serverId,
          reference,
          argument: { name: argName, value: argValue },
          context,
        });
        setSuggestions((s) => ({
          ...s,
          [argName]: completion.values ?? [],
        }));
      } catch (e) {
        onError(e);
      }
    },
    [serverId, reference, value, onError],
  );
  const scheduleComplete = (argName: string) => {
    clearTimeout(debounceRef.current[argName]);
    debounceRef.current[argName] = setTimeout(() => void complete(argName), 300);
  };
  return (
    <div className="schema-fields">
      {argumentDefs.map((def) => (
        <label key={def.name}>
          {def.name}
          {def.required ? " *" : ""}
          {def.description && (
            <span className="hint block">{def.description}</span>
          )}
          <input
            list={`complete-${def.name}`}
            value={value[def.name] ?? ""}
            disabled={disabled}
            onChange={(e) => {
              onChange({ ...value, [def.name]: e.target.value });
              scheduleComplete(def.name);
            }}
            onFocus={() => void complete(def.name)}
          />
          <datalist id={`complete-${def.name}`}>
            {(suggestions[def.name] ?? []).map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </label>
      ))}
    </div>
  );
}

export function ToolResultView({
  value,
  tool,
  serverId,
  toolInput,
  onAppToolCall,
  appFrameRef,
}: {
  value: unknown;
  tool?: Tool;
  serverId?: string;
  toolInput?: unknown;
  onAppToolCall?: (req: AppToolCallRequest) => void;
  appFrameRef?: React.RefObject<HTMLIFrameElement | null>;
}) {
  const r = value as ToolCallResult;
  const schemaWarn =
    tool?.outputSchema && r?.structuredContent !== undefined
      ? validateOutputSchema(r.structuredContent, tool.outputSchema)
      : null;
  const parts = r?.content;
  const userParts =
    parts?.filter(
      (p) => !p.audience?.length || p.audience.includes("user"),
    ) ?? [];
  const showStructured = r?.structuredContent !== undefined;
  if (!showStructured && (!userParts.length || !Array.isArray(parts))) {
    return <pre className="result-code">{pretty(value)}</pre>;
  }
  return (
    <div className="rich-result">
      {schemaWarn && <p className="error">{schemaWarn}</p>}
      {showStructured && (
        <details open>
          <summary>Structured content</summary>
          <pre>{pretty(r.structuredContent)}</pre>
        </details>
      )}
      {userParts.map((part: ContentPart, i: number) => (
        <div key={i} className="content-part">
          {part.type === "text" || (!part.type && part.text) ? (
            <pre>{part.text ?? ""}</pre>
          ) : part.type === "image" && part.data ? (
            <img
              alt={part.name ?? "Tool image"}
              src={`data:${part.mimeType ?? "image/png"};base64,${part.data}`}
            />
          ) : part.type === "audio" && part.data ? (
            <audio
              controls
              src={`data:${part.mimeType ?? "audio/mpeg"};base64,${part.data}`}
            />
          ) : part.type === "resource_link" || part.type === "resource" ? (
            <p className="hint">
              Resource{" "}
              <code>{part.uri ?? part.resource?.uri ?? part.name}</code>
              {part.resource?.uri?.startsWith("ui://") && serverId && (
                <McpAppFrame
                  ref={appFrameRef}
                  serverId={serverId}
                  uri={part.resource.uri}
                  initialHtml={part.resource.text}
                  structuredContent={r.structuredContent}
                  toolInput={toolInput}
                  onAppToolCall={onAppToolCall}
                />
              )}
            </p>
          ) : (
            <pre>{pretty(part)}</pre>
          )}
        </div>
      ))}
      {r?.isError && <p className="error">Tool reported an error.</p>}
    </div>
  );
}

function SchemaFields({
  tool,
  value,
  onChange,
  disabled,
}: {
  tool: Tool;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const props = (tool.inputSchema.properties ?? {}) as Record<string, FieldSchema>;
  const required = new Set(tool.inputSchema.required ?? []);
  if (!Object.keys(props).length) return null;
  return (
    <div className="schema-fields">
      {Object.entries(props).map(([key, schema]) => (
        <SchemaFieldEditor
          key={key}
          label={key}
          schema={schema}
          required={required.has(key)}
          value={value[key]}
          onChange={(v) => onChange({ ...value, [key]: v })}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

/** Wrap identifiers on `_`, `-`, and `/` so a narrow list never splits a token. */
function breakableName(name: string) {
  return name.split(/([_/-])/).map((part, i) =>
    part === "_" || part === "-" || part === "/" ? (
      <Fragment key={i}>
        {part}
        <wbr />
      </Fragment>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

export default function Inspector({
  servers,
  connections,
  run,
  onTest,
  onError,
}: {
  servers: Server[];
  connections: Record<string, Connection>;
  run: (id: string, name: string, args: unknown) => Promise<Trace>;
  onTest: (t: TestCase) => void;
  onError: (e: unknown) => void;
}) {
  const [id, setId] = useState(""),
    [tab, setTab] = useState("tools"),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState(""),
    [args, setArgs] = useState("{}"),
    [result, setResult] = useState<unknown>(null),
    [busy, setBusy] = useState(false),
    [duration, setDuration] = useState<number | null>(null),
    [testName, setTestName] = useState(""),
    [contains, setContains] = useState(""),
    [copied, setCopied] = useState(false);
  const [catalog, setCatalog] = useState<Record<string, unknown>[]>([]),
    [log, setLog] = useState(""),
    [useForm, setUseForm] = useState(true),
    [formArgs, setFormArgs] = useState<Record<string, unknown>>({}),
    [catalogArgs, setCatalogArgs] = useState<Record<string, string>>({}),
    [selectedMeta, setSelectedMeta] = useState<Record<string, unknown> | null>(
      null,
    ),
    [progress, setProgress] = useState<string | null>(null),
    [lastToolInput, setLastToolInput] = useState<unknown>(null),
    [appToolCall, setAppToolCall] = useState<AppToolCallRequest | null>(null);
  const appFrameRef = useRef<HTMLIFrameElement | null>(null);
  const ids = Object.keys(connections),
    activeId = connections[id] ? id : (ids[0] ?? ""),
    connection = connections[activeId];
  const tools = connection?.tools ?? [];
  const loadLog = () =>
    api<string>("server_log", { id: activeId }).then(setLog).catch(onError);
  const tool = tools.find((t) => t.name === selected);
  useEffect(() => {
    setSelected("");
    setSearch("");
    setResult(null);
    setArgs("{}");
    setFormArgs({});
    setCatalogArgs({});
    setSelectedMeta(null);
    setCatalog([]);
    setProgress(null);
  }, [activeId, tab]);
  useEffect(() => {
    if (!activeId) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<{ serverId: string; progress: { message?: string } }>(
      "mcp-progress",
      (e) => {
        if (!disposed && e.payload.serverId === activeId)
          setProgress(e.payload.progress.message ?? "Working…");
      },
    ).then((fn) => {
      // Cleanup may have run before listen() resolved.
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [activeId]);
  useEffect(() => {
    let cancelled = false;
    if (tab === "log" && activeId) void loadLog();
    if (activeId && (tab === "resources" || tab === "prompts")) {
      setBusy(true);
      api<Record<string, unknown>[]>("server_catalog", {
        id: activeId,
        kind: tab,
      })
        .then((v) => {
          if (!cancelled) setCatalog(v);
        })
        .catch((e) => {
          if (!cancelled) onError(e);
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [activeId, tab]);
  const select = (t: Tool) => {
    setSelected(t.name);
    setResult(null);
    setDuration(null);
    const initial: Record<string, unknown> = {};
    Object.entries(t.inputSchema.properties ?? {}).forEach(([k, v]) => {
      if (t.inputSchema.required?.includes(k))
        initial[k] =
          v.default ??
          (v.type === "number" || v.type === "integer"
            ? 0
            : v.type === "boolean"
              ? false
              : v.type === "array"
                ? []
                : v.type === "object"
                  ? {}
                  : "");
    });
    setFormArgs(initial);
    setArgs(pretty(initial));
    setTestName(t.name);
  };
  const execute = async () => {
    setBusy(true);
    setResult(null);
    setProgress(null);
    try {
      const catalogArgDefs = Array.isArray(selectedMeta?.arguments)
        ? (selectedMeta!.arguments as { name: string }[])
        : [];
      const a =
        tab === "tools" && useForm && tool
          ? formArgs
          : tab !== "tools" && catalogArgDefs.length
            ? catalogArgs
            : parseObject(args);
      if (tab === "tools") {
        setLastToolInput(a);
        const trace = await run(activeId, selected, a);
        setResult(trace.result);
        setDuration(trace.duration);
      } else {
        const start = performance.now();
        setResult(
          await api(tab === "resources" ? "read_resource" : "get_prompt", {
            id: activeId,
            name: selected,
            uri: selected,
            arguments: a,
          }),
        );
        setDuration(Math.round(performance.now() - start));
      }
    } catch (e) {
      setResult({ error: String(e) });
      onError(e);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };
  const cancelCall = () => {
    if (activeId) void api("cancel_active_call", { id: activeId });
  };
  const save = async () => {
    try {
      const test = await api<TestCase>("save_test", {
        test: {
          id: "",
          name: testName || selected,
          serverId: activeId,
          tool: selected,
          arguments:
            tab === "tools" && useForm && tool
              ? formArgs
              : parseObject(args),
          contains,
        },
      });
      onTest(test);
    } catch (e) {
      onError(e);
    }
  };
  const respondAppToolCall = async (allow: boolean) => {
    if (!appToolCall) return;
    let result: unknown;
    if (allow) {
      try {
        result = (
          await run(activeId, appToolCall.toolName, appToolCall.arguments)
        ).result;
      } catch (e) {
        result = { error: String(e) };
      }
    } else result = { error: "User declined the MCP App tool call." };
    appFrameRef.current?.contentWindow?.postMessage(
      {
        type: "relay-app-tool-result",
        requestId: appToolCall.requestId,
        result,
      },
      "*",
    );
    setAppToolCall(null);
  };

  return (
    <div className="inspector panel">
      {appToolCall && (
        <div className="modal-backdrop">
          <section className="modal small-modal" role="dialog" aria-modal="true">
            <header>
              <h2>MCP App tool call</h2>
            </header>
            <div className="modal-body">
              <p>
                The app requested <strong>{appToolCall.toolName}</strong>.
              </p>
              <pre className="result-code">{pretty(appToolCall.arguments)}</pre>
            </div>
            <footer>
              <button className="button" onClick={() => respondAppToolCall(false)}>
                Decline
              </button>
              <button
                className="button primary"
                onClick={() => void respondAppToolCall(true)}
              >
                Run tool
              </button>
            </footer>
          </section>
        </div>
      )}
      <div className="inspector-toolbar">
        <div className="tab-buttons">
          {[
            { id: "tools", icon: Braces },
            { id: "resources", icon: FileText },
            { id: "prompts", icon: MessageSquare },
            { id: "log", icon: ScrollText },
            { id: "caps", icon: ShieldCheck },
          ].map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "active" : ""}
              disabled={busy}
              onClick={() => setTab(t.id)}
            >
              <t.icon size={15} />
              {t.id}
            </button>
          ))}
        </div>
        <select
          aria-label="Inspector server"
          value={activeId}
          disabled={busy}
          onChange={(e) => setId(e.target.value)}
        >
          {!ids.length && <option value="">No connected servers</option>}
          {ids.map((i) => (
            <option key={i} value={i}>
              {servers.find((s) => s.id === i)?.name ?? i}
            </option>
          ))}
        </select>
      </div>
      {!connection ? (
        <div className="empty">
          <Braces size={34} />
          <h2>Your tools, under the microscope.</h2>
          <p>
            Connect a server to inspect its tools, resources, and prompts.
            <br />
            You don’t need an AI model to get started.
          </p>
        </div>
      ) : tab === "caps" ? (
        <div className="server-log">
          <div className="result-heading">
            <h3>Server capabilities</h3>
            <p className="hint">
              Negotiated protocol version and advertised MCP capabilities.
            </p>
          </div>
          <pre className="result-code">{pretty(connection.info)}</pre>
          <p className="hint">
            Relay advertises elicitation, roots, and tasks. Sampling
            (createMessage) is deprecated and not supported.
          </p>
        </div>
      ) : tab === "log" ? (
        <div className="server-log">
          <div className="result-heading">
            <p className="hint">
              Stdio servers log to stderr; HTTP servers can send MCP logging
              notifications (shown here too). Last ~8 KB kept.
            </p>
            <button
              className="button small icon-only"
              title="Refresh"
              aria-label="Refresh log"
              onClick={() => void loadLog()}
            >
              <RefreshCw size={14} />
            </button>
          </div>
          <pre className="result-code">
            {log || "No log lines yet."}
          </pre>
        </div>
      ) : (
        <div className="inspector-grid">
          <aside className="tool-list">
            <div className="search">
              <Search size={15} />
              <input
                aria-label="Search tools"
                placeholder={`Find ${tab}…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="list-caption">
              {tab === "tools" ? tools.length : catalog.length} {tab}
            </div>
            {tab === "tools"
              ? tools
                  .filter((t) =>
                    t.name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((t) => (
                    <button
                      key={t.name}
                      className={`tool-row ${selected === t.name ? "active" : ""}`}
                      onClick={() => select(t)}
                      disabled={busy}
                    >
                      <Braces size={15} />
                      <div>
                        <strong>{breakableName(t.name)}</strong>
                        <span>
                          {t.description || "No description provided"}
                        </span>
                      </div>
                    </button>
                  ))
              : catalog
                  .filter((t) =>
                    String(t.name ?? t.uri)
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((t, i) => (
                    <button
                      key={i}
                      className={`tool-row ${selected === String(t.uri ?? t.name) ? "active" : ""}`}
                      disabled={busy}
                      onClick={() => {
                        setSelected(String(t.uri ?? t.name));
                        setSelectedMeta(t);
                        const params = Array.isArray(t.arguments)
                          ? (t.arguments as { name: string }[])
                          : [];
                        const initial = Object.fromEntries(
                          params.map((a) => [a.name, ""]),
                        );
                        setCatalogArgs(initial);
                        setArgs(pretty(initial));
                        setDuration(null);
                        setResult(null);
                      }}
                    >
                      <FileText size={15} />
                      <div>
                        <strong>
                          {breakableName(String(t.name ?? t.uri))}
                        </strong>
                        <span>{String(t.description ?? "")}</span>
                      </div>
                    </button>
                  ))}
            {!(tab === "tools" ? tools.length : catalog.length) && (
              <p className="hint padded">
                {busy ? "Discovering…" : `No ${tab} advertised by this server.`}
              </p>
            )}
          </aside>
          <section className="tool-detail">
            {!selected ? (
              <div className="empty compact">
                <Braces size={26} />
                <h3>
                  Select a{" "}
                  {tab === "tools"
                    ? "tool"
                    : tab === "resources"
                      ? "resource"
                      : "prompt"}
                </h3>
                <p>Inspect the schema and run a request.</p>
              </div>
            ) : (
              <>
                <div className="tool-heading">
                  <div>
                    <span className="eyebrow">
                      {tab === "tools"
                        ? "TOOLS / CALL"
                        : tab === "resources"
                          ? "RESOURCES / READ"
                          : "PROMPTS / GET"}
                    </span>
                    <h2>{breakableName(selected)}</h2>
                    <p>{tool?.description}</p>
                  </div>
                  {tool?.annotations?.readOnlyHint === true && (
                    <span className="badge">Read-only hint</span>
                  )}
                </div>
                {tool && (
                  <details className="schema">
                    <summary>
                      Input schema <span>JSON Schema</span>
                    </summary>
                    <pre>{pretty(tool.inputSchema)}</pre>
                  </details>
                )}
                {tab !== "resources" &&
                  Array.isArray(selectedMeta?.arguments) &&
                  (selectedMeta!.arguments as unknown[]).length > 0 && (
                    <CatalogArgumentEditor
                      serverId={activeId}
                      tab={tab}
                      itemName={selected}
                      uriTemplate={String(selectedMeta?.uriTemplate ?? "")}
                      argumentDefs={
                        selectedMeta!.arguments as {
                          name: string;
                          description?: string;
                          required?: boolean;
                        }[]
                      }
                      value={catalogArgs}
                      onChange={(v) => {
                        setCatalogArgs(v);
                        setArgs(pretty(v));
                      }}
                      disabled={busy}
                      onError={onError}
                    />
                  )}
                {tab !== "resources" && (
                  <>
                    {tab === "tools" && tool && useForm && (
                      <SchemaFields
                        tool={tool}
                        value={formArgs}
                        onChange={(v) => {
                          setFormArgs(v);
                          setArgs(pretty(v));
                        }}
                        disabled={busy}
                      />
                    )}
                    <div className="section-label">
                      <label htmlFor="tool-arguments">Request arguments</label>
                      <span className="mono">
                        {tab === "tools" && tool ? (
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => setUseForm((v) => !v)}
                          >
                            {useForm ? "JSON editor" : "Form fields"}
                          </button>
                        ) : (
                          "JSON"
                        )}
                      </span>
                    </div>
                    {!(
                      (tab === "tools" && tool && useForm) ||
                      (tab !== "tools" &&
                        Array.isArray(selectedMeta?.arguments) &&
                        (selectedMeta!.arguments as unknown[]).length > 0)
                    ) && (
                      <textarea
                        id="tool-arguments"
                        className="code args-editor"
                        spellCheck={false}
                        value={args}
                        onChange={(e) => setArgs(e.target.value)}
                        disabled={busy}
                      />
                    )}
                  </>
                )}
                <div className="run-row">
                  <p className="hint">
                    {progress ??
                      (tab === "tools"
                        ? "This executes the tool on your connected server."
                        : "Requests are sent directly to the connected server.")}
                  </p>
                  {busy && tab === "tools" && (
                    <button className="button" type="button" onClick={cancelCall}>
                      Cancel
                    </button>
                  )}
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={execute}
                  >
                    <Play size={14} />
                    {busy
                      ? "Running…"
                      : tab === "tools"
                        ? "Run tool"
                        : tab === "resources"
                          ? "Read resource"
                          : "Get prompt"}
                  </button>
                </div>
                <div className="result-heading">
                  <h3>Response</h3>
                  <div>
                    {duration !== null && (
                      <span className="badge">{duration} ms</span>
                    )}
                    <button
                      className="icon-button"
                      aria-label="Copy response"
                      disabled={result === null}
                      onClick={() => {
                        navigator.clipboard
                          .writeText(pretty(result))
                          .then(() => {
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1500);
                          })
                          .catch(onError);
                      }}
                    >
                      {copied ? <Check size={15} /> : <Copy size={15} />}
                    </button>
                  </div>
                </div>
                {result === null ? (
                  <pre className="result-code">
                    Run a request to see its response here.
                  </pre>
                ) : tab === "tools" ? (
                  <ToolResultView
                    value={result}
                    tool={tool}
                    serverId={activeId}
                    toolInput={lastToolInput}
                    onAppToolCall={setAppToolCall}
                    appFrameRef={appFrameRef}
                  />
                ) : (
                  <pre className="result-code">{pretty(result)}</pre>
                )}
                {tab === "tools" && (
                  <div className="save-test">
                    <h3>Keep this as a test</h3>
                    <div className="test-fields">
                      <input
                        aria-label="Test name"
                        placeholder="Test name"
                        value={testName}
                        onChange={(e) => setTestName(e.target.value)}
                      />
                      <input
                        aria-label="Expected response text"
                        placeholder="Response must contain… (optional)"
                        value={contains}
                        onChange={(e) => setContains(e.target.value)}
                      />
                      <button className="button" onClick={save} disabled={busy}>
                        <Save size={14} /> Save test
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
