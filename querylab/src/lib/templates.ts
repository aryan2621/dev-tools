import type { EngineMeta, SchemaObject, TableView } from "../types";
import { supportsTableView, tableSql } from "./tableView";

export interface QueryDraft {
  input: string;
  operation: string | null;
  table?: TableView;
}

const SIMPLE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const BACKTICK_ENGINES = new Set(["mysql", "mariadb", "clickhouse", "databricks"]);

export function quotePart(engine: string, name: string): string {
  if (BACKTICK_ENGINES.has(engine)) return `\`${name}\``;
  return SIMPLE_IDENTIFIER.test(name) ? name : `"${name.replace(/"/g, '""')}"`;
}

export function quoteIdentifier(engine: string, name: string): string {
  return name.split(".").map((part) => quotePart(engine, part)).join(".");
}

const ROW_CAP = 100;

function limitedSelect(target: string): string {
  return `SELECT * FROM ${target} LIMIT ${ROW_CAP}`;
}

const DOCUMENT_TEMPLATES: Record<string, (name: string) => QueryDraft> = {
  mongodb: (name) => ({ input: JSON.stringify({ find: name, filter: {}, limit: 100 }, null, 2), operation: null }),
  elasticsearch: (name) => ({ input: JSON.stringify({ _index: name, query: { match_all: {} }, size: 100 }, null, 2), operation: "_search" }),
  opensearch: (name) => ({ input: JSON.stringify({ _index: name, query: { match_all: {} }, size: 100 }, null, 2), operation: "_search" }),
  neo4j: (name) => ({ input: `MATCH (n:\`${name}\`) RETURN n LIMIT 100`, operation: null }),
};

export function selectRowsDraft(engine: EngineMeta, object: SchemaObject): QueryDraft | null {
  if (engine.isSql) {
    if (supportsTableView(engine.kind) && object.kind.toLowerCase() === "table") {
      const table: TableView = { object, page: 0, orderBy: null, desc: false, where: "" };
      return { input: tableSql(engine.kind, table), operation: null, table };
    }
    return { input: limitedSelect(quoteIdentifier(engine.kind, object.name)), operation: null };
  }
  return DOCUMENT_TEMPLATES[engine.kind]?.(object.name) ?? null;
}
