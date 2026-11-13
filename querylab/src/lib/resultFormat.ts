import type { QueryResult } from "../types";

const TEXT_COLUMN_MAX = 48;
export const VIEW_ROW_LIMIT = 5000;

export function toRecords({ columns, rows }: QueryResult, limit = rows.length) {
  return rows.slice(0, limit).map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index]])));
}

export function toJson(result: QueryResult, limit?: number): string {
  return JSON.stringify(toRecords(result, limit), null, 2);
}

export function toTsv({ columns, rows }: QueryResult): string {
  const cell = (value: string | null) => (value ?? "").replace(/[\t\r\n]+/g, " ");
  return [columns, ...rows].map((row) => row.map(cell).join("\t")).join("\n");
}

export function toTextTable({ columns, rows }: QueryResult, limit = rows.length): string {
  const body = rows.slice(0, limit).map((row) => row.map((value) => (value ?? "NULL").replace(/\s+/g, " ").slice(0, TEXT_COLUMN_MAX)));
  const widths = columns.map((name, index) => body.reduce((max, row) => Math.max(max, row[index].length), name.length));
  const line = (cells: string[]) => cells.map((value, index) => value.padEnd(widths[index])).join("  ").trimEnd();
  return [line(columns), line(widths.map((width) => "-".repeat(width))), ...body.map(line)].join("\n");
}
