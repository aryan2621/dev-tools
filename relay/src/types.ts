export type Json = unknown;
/** Static Authorization header configured — not OAuth sign-in. */
export function serverUsesBearerAuth(server: Server): boolean {
  return server.headers.some((h) => h.toLowerCase() === "authorization");
}

/** OAuth sign-in failed because the server does not offer dynamic client registration. */
export function suggestsBearerInsteadOfOAuth(error: string): boolean {
  const lower = error.toLowerCase();
  return (
    lower.includes("dynamic client registration") ||
    lower.includes("client registration not supported")
  );
}

export interface Server {
  id: string;
  name: string;
  transport: "stdio" | "http";
  url: string;
  command: string;
  args: string[];
  cwd: string;
  headers: string[];
  env: string[];
  /** Absolute folders exposed through MCP roots/list. */
  roots: string[];
  /** Fixed OAuth callback port (register http://localhost:PORT/callback at the AS). */
  oauthRedirectPort?: number;
}
export interface ElicitationPrompt {
  requestId: string;
  serverId: string;
  mode: "form" | "url" | string;
  message: string;
  requestedSchema?: unknown;
  url?: string;
  urlOrigin?: string;
}
export interface SandboxCallPrompt {
  callId: string;
  serverId: string;
  toolName: string;
  arguments: unknown;
}
export type ContentPart = {
  type?: string;
  text?: string;
  mimeType?: string;
  data?: string;
  uri?: string;
  name?: string;
  audience?: ("user" | "assistant")[];
  annotations?: Record<string, unknown>;
  resource?: { uri?: string; mimeType?: string; text?: string };
};
export type ToolCallResult = {
  content?: ContentPart[];
  structuredContent?: unknown;
  isError?: boolean;
  _meta?: Record<string, unknown>;
};
export interface Tool {
  name: string;
  description?: string;
  inputSchema: {
    type?: string;
    properties?: Record<
      string,
      { type?: string; description?: string; default?: unknown }
    >;
    required?: string[];
  };
  annotations?: Record<string, unknown>;
  outputSchema?: unknown;
}
export interface Connection {
  info: {
    serverInfo?: { name: string; version: string };
    protocolVersion?: string;
    capabilities?: Record<string, unknown>;
    /** MCP initialize instructions from the connected server. */
    instructions?: string;
  };
  tools: Tool[];
  /** Connected with a saved sign-in (OAuth). */
  signedIn?: boolean;
}
export interface Provider {
  id: string;
  model: string;
  baseUrl: string;
}
export interface TestCase {
  id: string;
  name: string;
  serverId: string;
  tool: string;
  arguments: unknown;
  contains: string;
}
export interface Workspace {
  servers: Server[];
  providers: Provider[];
  tests: TestCase[];
}
export interface Trace {
  id: string;
  time: string;
  server: string;
  name: string;
  arguments: unknown;
  result: unknown;
  duration: number;
  error: boolean;
}
export interface Call {
  id: string;
  name: string;
  arguments: unknown;
}
export interface Step {
  text: string;
  calls: Call[];
  history: unknown[];
  usage: unknown;
}
export interface ToolOutput {
  id: string;
  content: string;
}
export const providers = [
  { id: "claude", name: "Claude", detail: "Anthropic" },
  { id: "openai", name: "OpenAI", detail: "GPT models" },
  { id: "gemini", name: "Gemini", detail: "Google" },
];
export interface LocalModel {
  id: string;
  name: string;
  note: string;
  sizeMb: number;
  minRamGb: number;
  repo: string;
  installed: boolean;
}
export interface Catalog {
  ramGb: number;
  recommended: string;
  models: LocalModel[];
}
export const emptyServer = (): Server => ({
  id: "",
  name: "",
  transport: "http",
  url: "",
  command: "",
  args: [],
  cwd: "",
  headers: [],
  env: [],
  roots: [],
  oauthRedirectPort: undefined,
});
export const pretty = (v: unknown) => JSON.stringify(v, null, 2) ?? "";

/** Text the model should see (assistant audience or untagged parts). */
export function toolResultTextForModel(result: unknown): string {
  const r = result as ToolCallResult;
  if (r?.structuredContent !== undefined) {
    return pretty(r.structuredContent);
  }
  const parts = r?.content;
  if (!Array.isArray(parts)) return pretty(result);
  const lines: string[] = [];
  for (const part of parts) {
    const aud = part.audience;
    if (aud?.length && !aud.includes("assistant")) continue;
    if (part.type === "text" && part.text) lines.push(part.text);
    else if (part.type === "resource" && part.resource?.uri)
      lines.push(`[resource ${part.resource.uri}]`);
    else if (part.text) lines.push(part.text);
  }
  return lines.join("\n") || pretty(result);
}

export function toolAnnotations(tool: Tool | undefined) {
  return tool?.annotations as
    | {
        destructiveHint?: boolean;
        readOnlyHint?: boolean;
        idempotentHint?: boolean;
      }
    | undefined;
}

export function toolNeedsUserApproval(tool: Tool | undefined): boolean {
  const ann = toolAnnotations(tool);
  if (ann?.readOnlyHint) return false;
  if (ann?.destructiveHint) return true;
  return true;
}

export function toolIsDestructive(tool: Tool | undefined): boolean {
  return !!toolAnnotations(tool)?.destructiveHint;
}

type JsonSchemaLite = {
  type?: string | string[];
  properties?: Record<string, JsonSchemaLite>;
  required?: string[];
  items?: JsonSchemaLite;
  enum?: unknown[];
};

function valueMatchesType(value: unknown, t: string): boolean {
  if (t === "object")
    return typeof value === "object" && value !== null && !Array.isArray(value);
  if (t === "array") return Array.isArray(value);
  if (t === "string") return typeof value === "string";
  if (t === "number") return typeof value === "number";
  if (t === "integer")
    return typeof value === "number" && Number.isInteger(value);
  if (t === "boolean") return typeof value === "boolean";
  if (t === "null") return value === null;
  return true;
}

/** Validate structured tool output against a JSON Schema subset (no $ref). */
export function validateOutputSchema(
  value: unknown,
  schema: unknown,
  path = "structuredContent",
): string | null {
  if (schema === undefined || schema === null) return null;
  const s = schema as JsonSchemaLite;
  if (
    s.enum?.length &&
    !s.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))
  )
    return `${path} must be one of: ${s.enum.map(String).join(", ")}`;
  const types = s.type ? (Array.isArray(s.type) ? s.type : [s.type]) : [];
  if (types.length && !types.some((t) => valueMatchesType(value, t)))
    return `${path} must be ${types.join(" or ")} (per outputSchema).`;
  if (
    (types.includes("object") || s.properties) &&
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    const obj = value as Record<string, unknown>;
    for (const key of s.required ?? []) {
      if (!(key in obj) || obj[key] === undefined)
        return `${path}.${key} is required by outputSchema.`;
    }
    for (const [key, sub] of Object.entries(s.properties ?? {})) {
      if (key in obj && obj[key] !== undefined) {
        const err = validateOutputSchema(obj[key], sub, `${path}.${key}`);
        if (err) return err;
      }
    }
  }
  if (types.includes("array") || s.items) {
    if (!Array.isArray(value)) return `${path} must be an array.`;
    for (let i = 0; i < value.length; i++) {
      const err = validateOutputSchema(
        value[i],
        s.items ?? {},
        `${path}[${i}]`,
      );
      if (err) return err;
    }
  }
  return null;
}

export function structuredContentMismatch(
  structured: unknown,
  outputSchema: unknown,
): string | null {
  if (structured === undefined) return null;
  return validateOutputSchema(structured, outputSchema);
}

export function extractJavaScriptBlocks(text: string): string[] {
  const re = /```(?:javascript|js)\s*\n([\s\S]*?)```/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const block = m[1]?.trim();
    if (block) out.push(block);
  }
  return out;
}

export function wrapMcpAppDocument(html: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_blank"></head><body>
<script>
window.addEventListener("message",function(e){if(e.data&&e.data.type==="relay-app-init"){window.dispatchEvent(new CustomEvent("mcp-app-init",{detail:e.data}));}};
window.parent.postMessage({type:"relay-app-ready"},"*");
// Apps: parent.postMessage({type:"relay-app-tool-call",requestId:"…",toolName:"…",arguments:{…}},"*");
</script>
${html}
</body></html>`;
}

export function parseObject(s: string): Record<string, unknown> {
  const v: unknown = JSON.parse(s);
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error('Enter a JSON object, for example {"name": "world"}.');
  return v as Record<string, unknown>;
}
