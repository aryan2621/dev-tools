import { Braces, ChevronDown, Copy, Download, Loader2, Play, Table2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ExportFormat } from "../hooks/useWorkbench";
import { formatDuration } from "../lib/format";
import { copyWithToast } from "../lib/notify";
import { toJson, toTsv, VIEW_ROW_LIMIT } from "../lib/resultFormat";
import { SHORTCUTS } from "../lib/shortcuts";
import type { QueryResult, QueryTab } from "../types";
import { Hint, Keys } from "./Hint";
import { InlineError } from "./InlineError";
import { ResultGrid, type GridOptions } from "./ResultGrid";
import { StateMessage } from "./StateMessage";

type ResultView = "grid" | "json";

const VIEWS: { value: ResultView; label: string; icon: typeof Table2 }[] = [
  { value: "grid", label: "Grid", icon: Table2 },
  { value: "json", label: "JSON", icon: Braces },
];

interface ResultsPanelProps {
  tab: QueryTab;
  onRetry: () => void;
  onExport: (format: ExportFormat) => void;
  grid?: GridOptions;
}

function RawView({ result }: { result: QueryResult }) {
  const body = useMemo(() => toJson(result, VIEW_ROW_LIMIT), [result]);
  const capped = result.rows.length > VIEW_ROW_LIMIT;
  return (
    <ScrollArea className="h-full">
      {capped && (
        <p className="border-b bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
          Showing the first {VIEW_ROW_LIMIT.toLocaleString()} of {result.rows.length.toLocaleString()} rows. Copy and export include all rows.
        </p>
      )}
      <pre className="w-max min-w-full select-text px-3 py-2 leading-5">{body}</pre>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}

function ResultBody({ tab, view, onRetry, grid }: { tab: QueryTab; view: ResultView; onRetry: () => void; grid?: GridOptions }) {
  const { result, error } = tab;
  if (error) return <InlineError message={error} onRetry={onRetry} className="m-2" />;
  if (tab.runId !== null && !result)
    return (
      <StateMessage icon={Loader2} iconClassName="animate-spin" title="Running query" className="items-center text-center" />
    );
  if (!result)
    return (
      <StateMessage
        icon={Play}
        title="No results yet"
        className="items-center text-center"
        hint={
          <span className="flex flex-wrap items-center justify-center gap-1.5">
            Press <Keys keys={SHORTCUTS.run} /> to run. Select text to run only the selection.
          </span>
        }
      />
    );
  if (result.columns.length === 0) return <StateMessage icon={Table2} title={result.message ?? "Done"} hint={formatDuration(result.durationMs)} className="items-center text-center" />;
  if (result.rows.length === 0) return <StateMessage icon={Table2} title="No rows returned" hint={formatDuration(result.durationMs)} className="items-center text-center" />;
  return view === "grid" ? <ResultGrid result={result} {...grid} /> : <RawView result={result} />;
}

export function ResultsPanel({ tab, onRetry, onExport, grid }: ResultsPanelProps) {
  const [view, setView] = useState<ResultView>("grid");
  const { result } = tab;
  const hasRows = Boolean(result?.columns.length && result.rows.length);

  const copy = () => {
    if (!result) return;
    copyWithToast(view === "json" ? toJson(result) : toTsv(result), `Copied ${result.rows.length.toLocaleString()} rows`);
  };

  return (
    <section aria-label="Results" aria-busy={tab.runId !== null} className="flex h-full flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-2.5">
        <h2 className="sr-only">Results</h2>
        {result && result.columns.length > 0 && (
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
            <span className="whitespace-nowrap">
              <span className="font-medium text-foreground">{result.rows.length.toLocaleString()}</span> rows
            </span>
            <span aria-hidden className="text-border">
              ·
            </span>
            <span className="whitespace-nowrap">{formatDuration(result.durationMs)}</span>
          </span>
        )}
        {result?.truncated && <Badge variant="warning">Row limit reached</Badge>}
        {result?.message && result.columns.length > 0 && <span className="min-w-0 truncate text-[11px] text-muted-foreground">{result.message}</span>}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <ToggleGroup
            type="single"
            size="sm"
            value={view}
            onValueChange={(next) => next && setView(next as ResultView)}
            aria-label="Result view"
            disabled={!hasRows}
            className="gap-0.5 rounded-md border bg-muted/40 p-0.5"
          >
            {VIEWS.map(({ value, label, icon: Icon }) => (
              <ToggleGroupItem
                key={value}
                value={value}
                aria-label={`${label} view`}
                className="h-6 gap-1 rounded-sm px-1.5 text-[11px] data-[state=on]:bg-background data-[state=on]:shadow-sm data-[state=on]:ring-1 data-[state=on]:ring-border"
              >
                <Icon className="size-3" />
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Hint label={view === "json" ? "Copy as JSON" : "Copy as TSV"}>
            <Button size="sm" variant="ghost" disabled={!hasRows} onClick={copy}>
              <Copy />
              Copy
            </Button>
          </Hint>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={!hasRows}>
                <Download />
                Export
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onExport("csv")}>Export as CSV</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onExport("json")}>Export as JSON</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <ResultBody tab={tab} view={view} onRetry={onRetry} grid={grid} />
      </div>
    </section>
  );
}
