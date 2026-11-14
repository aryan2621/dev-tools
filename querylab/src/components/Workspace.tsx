import { MessageCircleQuestion, Play, Square } from "lucide-react";
import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import type { EditorView } from "@codemirror/view";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROW_LIMITS, type ExportFormat } from "../hooks/useWorkbench";
import { SHORTCUTS } from "../lib/shortcuts";
import { canEdit, updateStatements } from "../lib/tableView";
import type { EngineMeta, QueryTab, SchemaInfo, TableView } from "../types";
import { Hint, IconAction } from "./Hint";
import { QueryEditor } from "./QueryEditor";
import type { GridOptions } from "./ResultGrid";
import { ResultsPanel } from "./ResultsPanel";
import { TableBar } from "./TableBar";

interface WorkspaceProps {
  tab: QueryTab;
  engine: EngineMeta | undefined;
  connected: boolean;
  viewRef: MutableRefObject<EditorView | null>;
  selectionRef: MutableRefObject<string>;
  onChange: (patch: Partial<QueryTab>) => void;
  onRun: () => void;
  onCancel: () => void;
  onExport: (format: ExportFormat) => void;
  onExplain: () => void;
  schema?: SchemaInfo;
  rowLimit: number;
  onRowLimit: (limit: number) => void;
  onBrowse: (view: TableView) => void;
  onApply: (statements: string[]) => Promise<boolean>;
}

export function Workspace({ tab, engine, connected, viewRef, selectionRef, onChange, onRun, onCancel, onExport, onExplain, schema, rowLimit, onRowLimit, onBrowse, onApply }: WorkspaceProps) {
  const running = tab.runId !== null;
  const { table, result } = tab;
  const [edits, setEdits] = useState<Map<string, string>>(new Map());
  const [reviewing, setReviewing] = useState(false);
  useEffect(() => setEdits(new Map()), [result]);

  const editable = Boolean(engine) && canEdit(engine!.kind, table, result);
  const statements = useMemo(() => (editable && table && result ? updateStatements(engine!.kind, table, result, edits) : []), [editable, engine, table, result, edits]);
  const grid: GridOptions | undefined = table && {
    editing: editable
      ? { edits, onEdit: (row, column, value) => setEdits((current) => (value === result?.rows[row][column] ? current : new Map(current).set(`${row}:${column}`, value))) }
      : undefined,
    sort: { column: table.orderBy, desc: table.desc },
    onSort: (column) => onBrowse({ ...table, orderBy: column, desc: table.orderBy === column && !table.desc, page: 0 }),
  };
  const apply = async () => {
    if (await onApply(statements)) onBrowse(table!);
    setReviewing(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b px-2">
        {running ? (
          <Button variant="destructive" onClick={onCancel}>
            <Square />
            Cancel
          </Button>
        ) : (
          <Hint label={connected ? "Run query" : "Connect to run queries"} keys={connected ? SHORTCUTS.run : undefined}>
            <span tabIndex={connected ? -1 : 0}>
              <Button onClick={onRun} disabled={!connected}>
                <Play />
                Run
              </Button>
            </span>
          </Hint>
        )}
        {engine && engine.operations.length > 0 && (
          <Select value={tab.operation ?? engine.defaultOperation ?? ""} onValueChange={(operation) => onChange({ operation })}>
            <SelectTrigger aria-label="Operation" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {engine.operations.map((operation) => (
                <SelectItem key={operation} value={operation}>
                  {operation}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <IconAction label={tab.error ? "Ask AI about this error" : "Ask AI about this query"} onClick={onExplain} disabled={!tab.input.trim()}>
          <MessageCircleQuestion />
        </IconAction>
        <Select value={String(rowLimit)} onValueChange={(limit) => onRowLimit(Number(limit))}>
          <SelectTrigger aria-label="Row limit" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROW_LIMITS.map((limit) => (
              <SelectItem key={limit} value={String(limit)}>
                {limit.toLocaleString()} rows
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {table && <TableBar view={table} rows={result?.rows.length ?? 0} disabled={running || !connected} onChange={onBrowse} />}
      {statements.length > 0 && (
        <div className="flex h-9 shrink-0 items-center gap-2 border-b bg-accent px-2 text-sm">
          <span className="tabular-nums">{statements.length} row{statements.length === 1 ? "" : "s"} changed</span>
          <Button size="sm" className="ml-auto" onClick={() => setReviewing(true)}>
            Review and apply
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEdits(new Map())}>
            Discard
          </Button>
        </div>
      )}
      <ResizablePanelGroup key={table ? "table" : "query"} direction="vertical" autoSaveId={table ? "querylab-table-results" : "querylab-editor-results"} className="min-h-0 flex-1">
        <ResizablePanel id="editor" order={1} defaultSize={table ? 12 : 45} minSize={table ? 8 : 15}>
          <QueryEditor engine={engine} value={tab.input} onChange={(input) => onChange({ input, table: undefined })} onRun={onRun} viewRef={viewRef} selectionRef={selectionRef} schema={schema} />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="results" order={2} defaultSize={table ? 88 : 55} minSize={15}>
          <ResultsPanel tab={tab} onRetry={onRun} onExport={onExport} grid={grid} />
        </ResizablePanel>
      </ResizablePanelGroup>
      <AlertDialog open={reviewing} onOpenChange={setReviewing}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Apply {statements.length} change{statements.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>These run in one transaction and roll back together if any fails.</AlertDialogDescription>
          </AlertDialogHeader>
          <pre className="max-h-64 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-xs">{statements.join(";\n")}</pre>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={apply}>Apply</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
