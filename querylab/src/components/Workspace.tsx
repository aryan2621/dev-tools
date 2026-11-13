import { ChevronDown, Clock, Play, Square, Trash2 } from "lucide-react";
import { useCallback, useState, type MutableRefObject } from "react";
import type { EditorView } from "@codemirror/view";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "../api";
import type { ExportFormat } from "../hooks/useWorkbench";
import { firstLine, formatTime } from "../lib/format";
import { SHORTCUTS } from "../lib/shortcuts";
import type { EngineMeta, HistoryEntry, QueryTab } from "../types";
import { Hint } from "./Hint";
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
}

const HISTORY_MENU_LIMIT = 30;

export function Workspace({ tab, engine, connected, viewRef, selectionRef, onChange, onRun, onCancel, onExport }: WorkspaceProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const running = tab.runId !== null;

  const loadHistory = useCallback(
    async (open: boolean) => {
      if (!open) return;
      const entries = await api<HistoryEntry[]>("history_list", { id: tab.profileId });
      setHistory([...entries].sort((a, b) => b.at - a.at).slice(0, HISTORY_MENU_LIMIT));
    },
    [tab.profileId],
  );

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
        <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />
        <DropdownMenu onOpenChange={loadHistory}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost">
              <Clock />
              History
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 w-[380px] overflow-y-auto">
            {history.length === 0 && <DropdownMenuItem disabled>No history yet</DropdownMenuItem>}
            {history.map((entry) => (
              <DropdownMenuItem key={`${entry.at}-${entry.input}`} onSelect={() => onChange({ input: entry.input, operation: entry.operation ?? tab.operation })}>
                <span className="w-24 shrink-0 text-[11px] text-muted-foreground">{formatTime(entry.at)}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{firstLine(entry.input, 64)}</span>
                {!entry.ok && <span className="text-[10px] font-medium text-destructive">failed</span>}
              </DropdownMenuItem>
            ))}
            {history.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => api("history_clear", { id: tab.profileId }).then(() => setHistory([]))}
                >
                  <Trash2 />
                  Clear history
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
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
