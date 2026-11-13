import { Play, Sparkles, Square } from "lucide-react";
import type { MutableRefObject } from "react";
import type { EditorView } from "@codemirror/view";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROW_LIMITS, type ExportFormat } from "../hooks/useWorkbench";
import { SHORTCUTS } from "../lib/shortcuts";
import type { EngineMeta, QueryTab } from "../types";
import { Hint, IconAction } from "./Hint";
import { QueryEditor } from "./QueryEditor";
import { ResultsPanel } from "./ResultsPanel";

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
  rowLimit: number;
  onRowLimit: (limit: number) => void;
}

export function Workspace({ tab, engine, connected, viewRef, selectionRef, onChange, onRun, onCancel, onExport, onExplain, rowLimit, onRowLimit }: WorkspaceProps) {
  const running = tab.runId !== null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b px-2">
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
                {connected && <kbd className="ml-0.5 rounded bg-primary-foreground/15 px-1 py-px font-sans text-[10px] font-medium leading-4 opacity-80">{SHORTCUTS.run.join("")}</kbd>}
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
        <IconAction label={tab.error ? "Explain error with AI" : "Explain query with AI"} onClick={onExplain} disabled={!tab.input.trim()}>
          <Sparkles />
        </IconAction>
        <Select value={String(rowLimit)} onValueChange={(limit) => onRowLimit(Number(limit))}>
          <SelectTrigger aria-label="Row limit" className="w-32">
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
        {engine?.consoleHint && (
          <Hint label={engine.consoleHint}>
            <span className="ml-auto min-w-0 truncate rounded-md bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground">{engine.consoleHint}</span>
          </Hint>
        )}
      </div>
      <ResizablePanelGroup direction="vertical" autoSaveId="querylab-editor-results" className="min-h-0 flex-1">
        <ResizablePanel id="editor" order={1} defaultSize={45} minSize={15}>
          <QueryEditor engine={engine} value={tab.input} onChange={(input) => onChange({ input })} onRun={onRun} viewRef={viewRef} selectionRef={selectionRef} />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="results" order={2} defaultSize={55} minSize={15}>
          <ResultsPanel tab={tab} onRetry={onRun} onExport={onExport} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
