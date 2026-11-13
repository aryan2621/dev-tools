export const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
export type Method = (typeof METHODS)[number];

export interface KV {
  id: string;
  enabled: boolean;
  key: string;
  value: string;
  isFile: boolean;
  filePath: string;
}

export const BODY_LABELS = {
  none: "None",
  json: "JSON",
  text: "Raw Text",
  formUrlEncoded: "Form URL Encoded",
  multipart: "Multipart Form",
  binary: "Binary File",
  graphql: "GraphQL",
} as const;
export type BodyType = keyof typeof BODY_LABELS;

export const AUTH_LABELS = {
  none: "None",
  bearer: "Bearer Token",
  basic: "Basic Auth",
  apiKey: "API Key",
} as const;
export type AuthType = keyof typeof AUTH_LABELS;

export const CODE_LABELS = {
  curl: "cURL",
  javascript: "JavaScript (fetch)",
  python: "Python (requests)",
} as const;
export type CodeTarget = keyof typeof CODE_LABELS;

export interface RequestBody {
  type: BodyType;
  raw: string;
  formItems: KV[];
  filePath: string;
  graphqlVariables: string;
}

export interface RequestAuth {
  type: AuthType;
  token: string;
  username: string;
  password: string;
  keyName: string;
  keyValue: string;
  keyInQuery: boolean;
}

export interface RequestSettings {
  timeout: number;
  followRedirects: boolean;
  allowInsecureTls: boolean;
}

export interface SavedRequest {
  id: string;
  name: string;
  method: Method;
  url: string;
  params: KV[];
  headers: KV[];
  body: RequestBody;
  auth: RequestAuth;
  settings: RequestSettings;
  captures: KV[];
}

export interface Folder {
  id: string;
  name: string;
  requests: SavedRequest[];
}

export interface Collection {
  id: string;
  name: string;
  requests: SavedRequest[];
  folders: Folder[];
  variables: KV[];
}

export interface Environment {
  id: string;
  name: string;
  variables: KV[];
}

export interface Snapshot {
  collections: Collection[];
  environments: Environment[];
  activeEnvironmentId: string | null;
}

export interface Header {
  name: string;
  value: string;
}

export interface CookieRow {
  name: string;
  value: string;
  detail: string;
}

export interface Capture {
  name: string;
  value: string;
}

export interface ApiResponse {
  status: number;
  statusText: string;
  headers: Header[];
  cookies: CookieRow[];
  body: string;
  prettyBody: string | null;
  binary: boolean;
  imageDataUrl: string | null;
  size: number;
  durationMs: number;
  resolvedUrl: string;
  mimeType: string | null;
  error: string | null;
  captured: Capture[];
}

export interface HistoryEntry {
  id: string;
  date: number;
  request: SavedRequest;
  status: number;
  durationMs: number;
}

export interface ProviderConfig {
  id: string;
  model: string;
  baseUrl: string;
}

export interface ProviderView extends ProviderConfig {
  hasKey: boolean;
}

export interface AiSettings {
  providers: ProviderView[];
  active: string;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolOutput {
  id: string;
  content: string;
}

export interface AiStep {
  text: string;
  calls: ToolCall[];
  history: unknown[];
}

export const newId = () => crypto.randomUUID();

export const newKV = (key = "", value = ""): KV => ({
  id: newId(),
  enabled: true,
  key,
  value,
  isFile: false,
  filePath: "",
});

export const newRequest = (): SavedRequest => ({
  id: newId(),
  name: "Untitled Request",
  method: "GET",
  url: "",
  params: [],
  headers: [],
  body: { type: "none", raw: "", formItems: [], filePath: "", graphqlVariables: "" },
  auth: {
    type: "none",
    token: "",
    username: "",
    password: "",
    keyName: "",
    keyValue: "",
    keyInQuery: false,
  },
  settings: { timeout: 60, followRedirects: true, allowInsecureTls: false },
  captures: [],
});

export const newFolder = (): Folder => ({ id: newId(), name: "New Folder", requests: [] });

export const newCollection = (name = "New Collection"): Collection => ({
  id: newId(),
  name,
  requests: [],
  folders: [],
  variables: [],
});

export const newEnvironment = (): Environment => ({
  id: newId(),
  name: "New Environment",
  variables: [],
});
