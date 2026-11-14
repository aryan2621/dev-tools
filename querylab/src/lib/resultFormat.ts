import type { QueryResult } from "../types";

export const VIEW_ROW_LIMIT = 5000;

function toRecords({ columns, rows }: QueryResult, limit = rows.length) {
  return rows.slice(0, limit).map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index]])));
}

export function toJson(result: QueryResult, limit?: number): string {
  return JSON.stringify(toRecords(result, limit), null, 2);
}

export function toTsv({ columns, rows }: QueryResult): string {
  const cell = (value: string | null) => (value ?? "").replace(/[\t\r\n]+/g, " ");
  return [columns, ...rows].map((row) => row.map(cell).join("\t")).join("\n");
}
