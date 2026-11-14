import type { QueryResult, TableView } from "../types";
import { quoteIdentifier, quotePart } from "./templates";

export const PAGE_SIZE = 100;

// Engines that share one session (so BEGIN/COMMIT works) and accept LIMIT/OFFSET.
const TABLE_ENGINES = new Set(["sqlite", "postgresql", "cockroachdb", "redshift", "mysql", "mariadb"]);
const BACKSLASH_ENGINES = new Set(["mysql", "mariadb"]);

export const supportsTableView = (engine: string) => TABLE_ENGINES.has(engine);

export function tableSql(engine: string, view: TableView): string {
  const where = view.where.trim() ? ` WHERE ${view.where.trim()}` : "";
  const order = view.orderBy ? ` ORDER BY ${quotePart(engine, view.orderBy)}${view.desc ? " DESC" : ""}` : "";
  const offset = view.page > 0 ? ` OFFSET ${view.page * PAGE_SIZE}` : "";
  return `SELECT * FROM ${quoteIdentifier(engine, view.object.name)}${where}${order} LIMIT ${PAGE_SIZE}${offset}`;
}

const primaryKeys = (view: TableView) => view.object.columns.filter((column) => column.primaryKey).map((column) => column.name);

// Editing needs a real table, a known primary key, and every key column present in the result.
export function canEdit(engine: string, view: TableView | undefined, result: QueryResult | null): boolean {
  if (!view || !result || !TABLE_ENGINES.has(engine) || view.object.kind.toLowerCase() !== "table") return false;
  const keys = primaryKeys(view);
  return keys.length > 0 && keys.every((key) => result.columns.includes(key));
}

function literal(engine: string, value: string | null): string {
  if (value === null) return "NULL";
  const text = BACKSLASH_ENGINES.has(engine) ? value.replace(/\\/g, "\\\\") : value;
  return `'${text.replace(/'/g, "''")}'`;
}

// shortcut: values go out as string literals and the database coerces them; emptying a cell that was NULL keeps it NULL, any other emptied cell becomes ''.
export function updateStatements(engine: string, view: TableView, result: QueryResult, edits: Map<string, string>): string[] {
  const byRow = new Map<number, Map<number, string>>();
  for (const [key, value] of edits) {
    const [row, column] = key.split(":").map(Number);
    byRow.set(row, (byRow.get(row) ?? new Map()).set(column, value));
  }
  const target = quoteIdentifier(engine, view.object.name);
  const keyColumns = primaryKeys(view).map((name) => [name, result.columns.indexOf(name)] as const);
  return [...byRow].map(([row, changes]) => {
    const set = [...changes].map(([column, value]) => `${quotePart(engine, result.columns[column])} = ${literal(engine, value === "" && result.rows[row][column] === null ? null : value)}`).join(", ");
    const where = keyColumns.map(([name, index]) => `${quotePart(engine, name)} = ${literal(engine, result.rows[row][index])}`).join(" AND ");
    return `UPDATE ${target} SET ${set} WHERE ${where}`;
  });
}
