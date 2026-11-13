import type { EngineMeta, SchemaObject } from "../types";

export interface QueryDraft {
  input: string;
  operation: string | null;
}

const SIMPLE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const BACKTICK_ENGINES = new Set(["mysql", "mariadb", "clickhouse", "databricks", "bigquery"]);

export function quoteIdentifier(engine: string, name: string): string {
  if (BACKTICK_ENGINES.has(engine)) return `\`${name}\``;
  if (engine === "sqlserver") return `[${name}]`;
  return SIMPLE_IDENTIFIER.test(name) ? name : `"${name.replace(/"/g, '""')}"`;
}

const DOCUMENT_TEMPLATES: Record<string, (name: string) => QueryDraft> = {
  mongodb: (name) => ({ input: JSON.stringify({ find: name, filter: {}, limit: 100 }, null, 2), operation: null }),
  elasticsearch: (name) => ({ input: JSON.stringify({ _index: name, query: { match_all: {} }, size: 100 }, null, 2), operation: "_search" }),
  opensearch: (name) => ({ input: JSON.stringify({ _index: name, query: { match_all: {} }, size: 100 }, null, 2), operation: "_search" }),
  dynamodb: (name) => ({ input: JSON.stringify({ TableName: name, Limit: 100 }, null, 2), operation: "scan" }),
  cassandra: (name) => ({ input: `SELECT * FROM ${name} LIMIT 100`, operation: null }),
  neo4j: (name) => ({ input: `MATCH (n:\`${name}\`) RETURN n LIMIT 100`, operation: null }),
};

export function selectRowsDraft(engine: EngineMeta, object: SchemaObject): QueryDraft | null {
  if (engine.isSql) return { input: `SELECT * FROM ${quoteIdentifier(engine.kind, object.name)} LIMIT 100`, operation: null };
  return DOCUMENT_TEMPLATES[engine.kind]?.(object.name) ?? null;
}
