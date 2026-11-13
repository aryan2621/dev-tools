import "@glideapps/glide-data-grid/dist/index.css";
import { DataEditor, GridCellKind, type GridCell, type GridColumn, type Item, type Theme } from "@glideapps/glide-data-grid";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { readTheme } from "../lib/gridTheme";
import type { QueryResult } from "../types";

const ROW_HEIGHT = 24;
const HEADER_HEIGHT = 28;
const MIN_WIDTH = 80;
const MAX_WIDTH = 420;
const CHAR_WIDTH = 7.4;
const SAMPLE_ROWS = 50;
const SMOOTH_SCROLL = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function initialWidths(result: QueryResult): number[] {
  return result.columns.map((name, index) => {
    const longest = result.rows.slice(0, SAMPLE_ROWS).reduce((max, row) => Math.max(max, (row[index] ?? "NULL").length), name.length);
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
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const refresh = () => setVersion((current) => current + 1);
    query.addEventListener("change", refresh);
    return () => query.removeEventListener("change", refresh);
  }, []);
  return useMemo(readTheme, [version]);
}

export function ResultGrid({ result }: { result: QueryResult }) {
  const [container, size] = useElementSize<HTMLDivElement>();
  const theme = useTokenTheme();
  const [widths, setWidths] = useState(() => initialWidths(result));

  useEffect(() => setWidths(initialWidths(result)), [result]);

  const columns: GridColumn[] = useMemo(
    () => result.columns.map((title, index) => ({ id: `${index}:${title}`, title, width: widths[index] ?? MIN_WIDTH })),
    [result.columns, widths],
  );

  const getCellContent = useCallback(
    ([column, row]: Item): GridCell => {
      const value = result.rows[row]?.[column] ?? null;
      return {
        kind: GridCellKind.Text,
        data: value ?? "",
        displayData: value ?? "NULL",
        allowOverlay: false,
        themeOverride: value === null ? { textDark: theme.textLight } : undefined,
      };
    },
    [result.rows, theme.textLight],
  );

  return (
    <div ref={container} className="h-full w-full" role="region" aria-label="Query results">
      {size.width > 0 && (
        <DataEditor
          width={size.width}
          height={size.height}
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
          onColumnResize={(_, width, index) => setWidths((current) => current.map((w, i) => (i === index ? width : w)))}
        />
      )}
    </div>
  );
}
