import { Braces, ChevronDown, Copy, Download, FileText, Loader2, Play, Table2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ExportFormat } from "../hooks/useWorkbench";
import { formatDuration } from "../lib/format";
import { toJson, toTextTable, toTsv, VIEW_ROW_LIMIT } from "../lib/resultFormat";
import { SHORTCUTS } from "../lib/shortcuts";
import type { QueryResult, QueryTab } from "../types";
import { Hint, Keys } from "./Hint";
import { InlineError } from "./InlineError";
import { ResultGrid } from "./ResultGrid";
import { StateMessage } from "./StateMessage";

type ResultView = "grid" | "json" | "text";

const VIEWS: { value: ResultView; label: string; icon: typeof Table2 }[] = [
  { value: "grid", label: "Grid", icon: Table2 },
  { value: "json", label: "JSON", icon: Braces },
  { value: "text", label: "Text", icon: FileText },
];

interface ResultsPanelProps {
  tab: QueryTab;
  onRetry: () => void;
  onExport: (format: ExportFormat) => void;
}

function RawView({ result, view }: { result: QueryResult; view: Exclude<ResultView, "grid"> }) {
  const body = useMemo(() => (view === "json" ? toJson(result, VIEW_ROW_LIMIT) : toTextTable(result, VIEW_ROW_LIMIT)), [result, view]);
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

function ResultBody({ tab, view, onRetry }: { tab: QueryTab; view: ResultView; onRetry: () => void }) {
  const { result, error } = tab;
  if (error) return <InlineError message={error} onRetry={onRetry} className="m-2" />;
  if (tab.runId !== null && !result)
    return (
      <StateMessage icon={Loader2} iconClassName="animate-spin" title="Running query..." hint="Use Cancel to stop it." className="items-center text-center">
        <div className="w-64 space-y-1.5" aria-hidden>
          <Skeleton className="h-3" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      </StateMessage>
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
  return view === "grid" ? <ResultGrid result={result} /> : <RawView result={result} view={view} />;
}

export function ResultsPanel({ tab, onRetry, onExport }: ResultsPanelProps) {
  const [view, setView] = useState<ResultView>("grid");
  const { result } = tab;
  const hasRows = Boolean(result?.columns.length && result.rows.length);

  const copy = () => {
    if (!result) return;
    navigator.clipboard
      .writeText(view === "json" ? toJson(result) : toTsv(result))
      .then(() => toast.success(`Copied ${result.rows.length.toLocaleString()} rows`, { description: view === "json" ? "As JSON" : "As tab-separated text" }));
  };

  return (
    <section aria-label="Results" aria-busy={tab.runId !== null} className="flex h-full flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-2.5">
        <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Table2 aria-hidden className="size-3.5" />
          Results
        </h2>
        {result && result.columns.length > 0 && (
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
            <span aria-hidden className="text-border">
              |
            </span>
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
              <DropdownMenuItem onSelect={() => onExport("csv")}>Export as CSV...</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onExport("json")}>Export as JSON...</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <ResultBody tab={tab} view={view} onRetry={onRetry} />
      </div>
    </section>
  );
}
