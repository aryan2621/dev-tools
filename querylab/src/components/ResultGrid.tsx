import { usePrefersDark } from "../hooks/usePrefersDark";
import "@glideapps/glide-data-grid/dist/index.css";
import { DataEditor, GridCellKind, type GridCell, type GridColumn, type Item, type Theme } from "@glideapps/glide-data-grid";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { readTheme } from "../lib/gridTheme";
import type { QueryResult } from "../types";
import { CellViewer, type CellValue } from "./CellViewer";

const ROW_HEIGHT = 22;
const HEADER_HEIGHT = 26;
const MIN_WIDTH = 80;
const MAX_WIDTH = 420;
const CHAR_WIDTH = 7.4;
const SAMPLE_ROWS = 50;
const SMOOTH_SCROLL = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function initialWidths(result: QueryResult): number[] {
  return result.columns.map((name, index) => {
    const longest = result.rows.slice(0, SAMPLE_ROWS).reduce((max, row) => Math.max(max, (row[index] ?? "NULL").length), name.length + (result.columnTypes[index]?.length ?? 0) + 2);
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, longest * CHAR_WIDTH + 28));
  });
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

function useTokenTheme(): Partial<Theme> {
  const dark = usePrefersDark();
  return useMemo(readTheme, [dark]);
}

export interface GridEditing {
  edits: Map<string, string>;
  onEdit: (row: number, column: number, value: string) => void;
}

export interface GridOptions {
  editing?: GridEditing;
  sort?: { column: string | null; desc: boolean };
  onSort?: (column: string) => void;
}

interface ResultGridProps extends GridOptions {
  result: QueryResult;
}

export function ResultGrid({ result, editing, sort, onSort }: ResultGridProps) {
  const [container, size] = useElementSize<HTMLDivElement>();
  const theme = useTokenTheme();
  const [cell, setCell] = useState<CellValue | null>(null);
  const [widths, setWidths] = useState(() => initialWidths(result));

  useEffect(() => setWidths(initialWidths(result)), [result]);

  const columns: GridColumn[] = useMemo(
    () => result.columns.map((title, index) => ({ id: `${index}:${title}`, title: `${result.columnTypes[index] ? `${title}  ${result.columnTypes[index].toLowerCase()}` : title}${sort?.column === title ? (sort.desc ? " ↓" : " ↑") : ""}`, width: widths[index] ?? MIN_WIDTH })),
    [result.columns, result.columnTypes, widths, sort],
  );

  const getCellContent = useCallback(
    ([column, row]: Item): GridCell => {
      const staged = editing?.edits.get(`${row}:${column}`);
      const value = staged ?? result.rows[row]?.[column] ?? null;
      return {
        kind: GridCellKind.Text,
        data: value ?? "",
        displayData: value ?? "NULL",
        allowOverlay: Boolean(editing),
        themeOverride: staged !== undefined ? { bgCell: theme.accentLight } : value === null ? { textDark: theme.textLight } : undefined,
      };
    },
    [result.rows, theme.textLight, theme.accentLight, editing],
  );

  return (
    <div ref={container} className="h-full w-full" role="region" aria-label="Query results">
      {size.width > 0 && (
        <DataEditor
          width={size.width}
          height={Math.min(size.height, HEADER_HEIGHT + result.rows.length * ROW_HEIGHT + 2)}
          columns={columns}
          rows={result.rows.length}
          getCellContent={getCellContent}
          rowHeight={ROW_HEIGHT}
          headerHeight={HEADER_HEIGHT}
          rowMarkers="number"
          theme={theme}
          smoothScrollX={SMOOTH_SCROLL}
          smoothScrollY={SMOOTH_SCROLL}
          getCellsForSelection
          onCellEdited={([column, row], cell) => cell.kind === GridCellKind.Text && editing?.onEdit(row, column, cell.data)}
          onHeaderClicked={(column) => onSort?.(result.columns[column])}
          onCellActivated={editing ? undefined : ([column, row]) => setCell({ column: result.columns[column], value: result.rows[row]?.[column] ?? null })}
          onColumnResize={(_, width, index) => setWidths((current) => current.map((w, i) => (i === index ? width : w)))}
        />
      )}
      <CellViewer cell={cell} onClose={() => setCell(null)} />
    </div>
  );
}
