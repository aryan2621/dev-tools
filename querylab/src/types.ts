export interface OptionField {
  key: string;
  label: string;
}

export interface EngineMeta {
  kind: string;
  displayName: string;
  category: string;
  summary: string;
  defaultPort: number;
  inputStyle: "sql" | "json" | "command" | "cypher" | "cql" | "text";
  isSql: boolean;
  driverKind: "native" | "http" | "cli";
  operations: string[];
  defaultOperation: string | null;
  consoleHint: string | null;
  credentialLabel: string;
  databaseLabel: string;
  fields: string[];
  optionFields: OptionField[];
  sslModes: string[];
  defaultSslMode: string;
  installHint: string | null;
}

export interface Profile {
  id: string;
  name: string;
  engine: string;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  filePath: string;
  uri: string;
  sslMode: string;
  region: string;
  awsProfile: string;
  endpointUrl: string;
  options: Record<string, string>;
}

export interface QueryResult {
  columns: string[];
  columnTypes: string[];
  rows: (string | null)[][];
  affectedRows: number | null;
  message: string | null;
  durationMs: number;
  truncated: boolean;
}

export interface SchemaColumn {
  name: string;
  typeName: string;
  nullable: boolean;
  primaryKey: boolean;
}

export interface SchemaObject {
  name: string;
  kind: string;
  columns: SchemaColumn[];
}

export interface SchemaInfo {
  objects: SchemaObject[];
  note: string | null;
}

export interface HistoryEntry {
  input: string;
  operation: string | null;
  at: number;
  ok: boolean;
}

export interface QueryTab {
  id: string;
  profileId: string;
  title: string;
  input: string;
  operation: string | null;
  result: QueryResult | null;
  error: string | null;
  runId: string | null;
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

export interface RunOutcome {
  result?: QueryResult;
  error?: string;
}
