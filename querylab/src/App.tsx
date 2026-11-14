import { ChevronRight, Command, Database, Play, Plug, Plus, RefreshCw, Settings, Sparkles, SquarePen, Table2, Unplug, X } from "lucide-react";
import { ConnectionSwitcher } from "./components/ConnectionSwitcher";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { IconAction } from "./components/Hint";
import { CommandPicker, type PickerGroup } from "./components/CommandPicker";
import { ConnectionForm } from "./components/ConnectionForm";
import { HistoryPanel } from "./components/HistoryPanel";
import { QueryTabs } from "./components/QueryTabs";
import { SchemaPanel } from "./components/SchemaPanel";
import { Welcome } from "./components/Welcome";
import { Workspace } from "./components/Workspace";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AgentPanel } from "./features/ai/AgentPanel";
import { SettingsSheet } from "./features/ai/SettingsSheet";
import { AgentProvider, useAgent } from "./features/ai/useAgent";
import type { ToolContext } from "./features/ai/tools";
import { useSchema } from "./hooks/useSchema";
import { useWorkbench } from "./hooks/useWorkbench";
import { SHORTCUTS } from "./lib/shortcuts";
import { selectRowsDraft } from "./lib/templates";
import { tableSql } from "./lib/tableView";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { Profile, SchemaObject, TableView } from "./types";
import { api } from "./api";
import { attempt } from "./lib/notify";

type PickerKind = "commands" | "switcher";

const PICKERS: Record<PickerKind, { title: string; placeholder: string }> = {
  commands: { title: "Command palette", placeholder: "Type a command" },
  switcher: { title: "Quick switcher", placeholder: "Switch connection or open table" },
};

const DDL_PATTERN = /^\s*(create|alter|drop|rename)\b/i;
const DESTRUCTIVE_PATTERN = /^\s*(drop|delete|truncate|update|alter)\b/i;

type Bench = ReturnType<typeof useWorkbench>;

export default function App() {
  const bench = useWorkbench();
  const context = useMemo<ToolContext>(
    () => ({
      profiles: bench.profiles,
      connectedIds: [...bench.connected],
      activeTab: bench.activeTab,
      newTab: bench.newTab,
      patchTab: bench.patchTab,
      run: bench.run,
    }),
    [bench.profiles, bench.connected, bench.activeTab, bench.newTab, bench.patchTab, bench.run],
  );
  return (
    <AgentProvider context={context}>
      <Shell bench={bench} />
    </AgentProvider>
  );
}

function Shell({ bench }: { bench: Bench }) {
  const agent = useAgent();
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const { activeProfile, activeEngine, activeTab } = bench;
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmRun, setConfirmRun] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Profile | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [picker, setPicker] = useState<PickerKind | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const selectionRef = useRef("");

  const live = activeProfile ? bench.connected.has(activeProfile.id) : false;
  const schemaState = useSchema(activeProfile?.id ?? null, live);

  const startRun = useCallback(() => {
    if (!activeTab || !live) return;
    const input = selectionRef.current.trim() || activeTab.input;
    bench.run(activeTab, selectionRef.current).then(() => {
      if (DDL_PATTERN.test(input)) schemaState.reload();
    });
  }, [activeTab, live, bench.run, schemaState.reload]);

  const browse = useCallback(
    (table: TableView) => {
      if (!activeTab || !activeEngine) return;
      const input = tableSql(activeEngine.kind, table);
      bench.patchTab(activeTab.id, { table, input });
      bench.run({ ...activeTab, table, input }, "");
    },
    [activeTab, activeEngine, bench.patchTab, bench.run],
  );

  const applyEdits = useCallback(
    async (statements: string[]) => {
      if (!activeTab) return false;
      return (await attempt(() => api("apply_edits", { id: activeTab.profileId, statements }), "Changes applied", "Could not apply changes")) !== undefined;
    },
    [activeTab],
  );

  const runActive = useCallback(() => {
    const input = selectionRef.current.trim() || activeTab?.input || "";
    if (activeProfile?.options.production === "true" && DESTRUCTIVE_PATTERN.test(input)) setConfirmRun(true);
    else startRun();
  }, [activeProfile, activeTab, startRun]);

  const openForm = useCallback((profile: Profile | null) => {
    setEditing(profile);
    setFormOpen(true);
  }, []);

  const insertName = (name: string) => {
    const view = viewRef.current;
    view?.dispatch(view.state.replaceSelection(name));
    view?.focus();
  };

  const selectRows = useCallback(
    (object: SchemaObject) => {
      const draft = activeEngine && selectRowsDraft(activeEngine, object);
      if (draft && activeProfile) {
        const tab = bench.newTab(activeProfile.id, draft);
        if (live) bench.run(tab, "");
      }
    },
    [activeEngine, activeProfile, live, bench.newTab, bench.run],
  );

  const connectionItems = useMemo(
    () =>
      bench.profiles.map((profile) => ({
        id: `switch-${profile.id}`,
        label: profile.name,
        icon: Database,
        detail: bench.engineFor(profile)?.displayName,
        run: () => bench.setActiveProfileId(profile.id),
      })),
    [bench.profiles, bench.engineFor, bench.setActiveProfileId],
  );

  const groups: PickerGroup[] = useMemo(() => {
    if (picker === "switcher") {
      return [
        { heading: "Connections", items: connectionItems },
        {
          heading: "Tables",
          items: (schemaState.schema?.objects ?? []).map((object) => ({
            id: `table-${object.name}`,
            label: object.name,
            icon: Table2,
            detail: object.kind,
            run: () => selectRows(object),
          })),
        },
      ].filter((group) => group.items.length > 0);
    }
    const actions = [
      { id: "run", label: "Run query", icon: Play, keys: SHORTCUTS.run, run: runActive },
      { id: "new-tab", label: "New tab", icon: SquarePen, keys: SHORTCUTS.newTab, run: () => activeProfile && bench.newTab(activeProfile.id) },
      { id: "close-tab", label: "Close tab", icon: X, keys: SHORTCUTS.closeTab, run: () => activeTab && bench.closeTab(activeTab.id) },
      { id: "assistant", label: agent.open ? "Hide assistant" : "Show assistant", icon: Sparkles, keys: SHORTCUTS.assistant, run: () => agent.setOpen(!agent.open) },
      { id: "new-connection", label: "New connection", icon: Plus, run: () => openForm(null) },
      ...(activeProfile
        ? [
            live
              ? { id: "disconnect", label: `Disconnect ${activeProfile.name}`, icon: Unplug, run: () => bench.disconnect(activeProfile.id) }
              : { id: "connect", label: `Connect ${activeProfile.name}`, icon: Plug, run: () => bench.connect(activeProfile.id) },
            { id: "refresh", label: "Refresh schema", icon: RefreshCw, run: schemaState.reload },
          ]
        : []),
    ];
    return [
      { heading: "Actions", items: actions },
      { heading: "Connections", items: connectionItems },
    ].filter((group) => group.items.length > 0);
  }, [picker, connectionItems, schemaState.schema, schemaState.reload, selectRows, runActive, activeProfile, activeTab, live, openForm, bench.newTab, bench.closeTab, bench.connect, bench.disconnect, agent.open, agent.setOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(event.metaKey || event.ctrlKey)) return;
      const shift = event.shiftKey;
      const stepTab = (step: number) => {
        const index = bench.tabs.findIndex((tab) => tab.id === activeTab?.id);
        const target = bench.tabs[(index + step + bench.tabs.length) % bench.tabs.length];
        if (target) bench.selectTab(target.id);
      };
      const actions: Record<string, () => void> = {
        tab: () => stepTab(shift ? -1 : 1),
        f: () => shift && document.getElementById("schema-filter")?.focus(),
        "1": () => document.getElementById("schema-filter")?.focus(),
        "2": () => setHistoryOpen((open) => !open),
        enter: runActive,
        t: () => activeProfile && bench.newTab(activeProfile.id),
        w: () => activeTab && bench.closeTab(activeTab.id),
        j: () => agent.setOpen(!agent.open),
        k: () => setPicker("commands"),
        p: () => setPicker("switcher"),
      };
      const action = actions[event.key.toLowerCase()];
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [runActive, agent.open, agent.setOpen, activeProfile, activeTab, bench.tabs, bench.selectTab, bench.newTab, bench.closeTab]);

  const showWorkspace = activeProfile && bench.tabs.length > 0 && activeTab;

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-screen w-screen flex-col">
        <ResizablePanelGroup direction="horizontal" autoSaveId="querylab-layout" className="min-h-0 flex-1">
          <ResizablePanel id="sidebar" order={1} defaultSize={22} minSize={20} maxSize={32} className="flex flex-col bg-sidebar">
            <div data-tauri-drag-region className="h-9 shrink-0" />
            <div className="shrink-0 px-2 pb-2">
              <ConnectionSwitcher
                profiles={bench.profiles}
                engineFor={bench.engineFor}
                active={activeProfile}
                connected={bench.connected}
                connecting={bench.connecting}
                onSelect={bench.setActiveProfileId}
                onConnect={bench.connect}
                onDisconnect={bench.disconnect}
                onEdit={openForm}
                onDuplicate={(profile) => openForm({ ...profile, id: "", name: `${profile.name} copy` })}
                onDelete={setPendingDelete}
                onAdd={() => openForm(null)}
              />
            </div>
            <div className="min-h-0 flex-1 border-t">
              <SchemaPanel
                state={schemaState}
                profileId={activeProfile?.id ?? null}
                connected={live}
                canSelectRows={(object) => Boolean(activeEngine && selectRowsDraft(activeEngine, object))}
                onSelectRows={selectRows}
                onInsertName={insertName}
              />
            </div>
            <Collapsible open={historyOpen} onOpenChange={setHistoryOpen} className="shrink-0 border-t">
              <CollapsibleTrigger className="flex h-8 w-full items-center gap-1.5 px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <ChevronRight aria-hidden className={cn("size-3 transition-transform duration-100 ease-out", historyOpen && "rotate-90")} />
                History
              </CollapsibleTrigger>
              <CollapsibleContent className="h-56 border-t">
                <HistoryPanel
                  profileId={activeProfile?.id ?? null}
                  refreshKey={activeTab?.runId ?? null}
                  onPick={(entry) => activeTab && bench.patchTab(activeTab.id, { input: entry.input, operation: entry.operation ?? activeTab.operation })}
                />
              </CollapsibleContent>
            </Collapsible>
            <div className="flex h-9 shrink-0 items-center gap-0.5 border-t px-1.5">
              <IconAction label="New connection" onClick={() => openForm(null)}>
                <Plus />
              </IconAction>
              <span className="ml-auto flex items-center gap-0.5">
                <IconAction label="Commands" keys={SHORTCUTS.palette} onClick={() => setPicker("commands")}>
                  <Command />
                </IconAction>
                <IconAction label="Assistant" keys={SHORTCUTS.assistant} aria-pressed={agent.open} className={agent.open ? "bg-accent text-foreground" : undefined} onClick={() => agent.setOpen(!agent.open)}>
                  <Sparkles />
                </IconAction>
                <IconAction label="AI settings" onClick={() => setAiSettingsOpen(true)}>
                  <Settings />
                </IconAction>
              </span>
            </div>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="main" order={2} defaultSize={78} minSize={30}>
            <main className="flex h-full min-w-0 flex-col bg-background">
              <div className="flex min-h-0 flex-1 flex-col">
              {showWorkspace ? (
                <QueryTabs
                  tabs={bench.tabs.map((tab) => ({ id: tab.id, title: tab.title, busy: tab.runId !== null }))}
                  activeId={activeTab.id}
                  onSelect={bench.selectTab}
                  onClose={bench.closeTab}
                  onNew={() => bench.newTab(activeProfile.id)}
                  onRename={(id, title) => bench.patchTab(id, { title })}
                >
                  <Workspace
                    key={activeTab.id}
                    tab={activeTab}
                    engine={activeEngine}
                    connected={live}
                    viewRef={viewRef}
                    selectionRef={selectionRef}
                    onChange={(patch) => bench.patchTab(activeTab.id, patch)}
                    onRun={runActive}
                    onCancel={() => bench.cancel(activeTab)}
                    onExport={(format) => activeTab.result && bench.exportResult(activeTab.result, format)}
                    onExplain={() => {
                      agent.ask(activeTab.error ? "Explain the error in my open query and suggest a fix." : "Explain my open query and suggest improvements.");
                    }}
                    schema={schemaState.schema ?? undefined}
                    rowLimit={bench.rowLimit}
                    onRowLimit={bench.setRowLimit}
                    onBrowse={browse}
                    onApply={applyEdits}
                  />
                </QueryTabs>
              ) : (
                <>
                <div data-tauri-drag-region className="h-9 shrink-0 border-b bg-sidebar" />
                <Welcome
                  engine={activeEngine}
                  profile={activeProfile}
                  live={live}
                  loading={bench.loading}
                  onNewConnection={() => openForm(null)}
                  onConnect={bench.connect}
                  onNewTab={(id) => bench.newTab(id)}
                />
                </>
              )}
              </div>
            </main>
          </ResizablePanel>
          {agent.open && (
            <>
              <ResizableHandle />
              <ResizablePanel id="assistant" order={3} defaultSize={28} minSize={20} maxSize={45}>
                <AgentPanel onSettings={() => setAiSettingsOpen(true)} />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
      <ConnectionForm open={formOpen} engines={bench.engines} initial={editing} onClose={() => setFormOpen(false)} onSave={bench.saveProfile} />
      <CommandPicker
        open={picker !== null}
        title={PICKERS[picker ?? "commands"].title}
        placeholder={PICKERS[picker ?? "commands"].placeholder}
        groups={groups}
        onOpenChange={(open) => !open && setPicker(null)}
      />
      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This removes the connection, its saved password and its query history. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingDelete && bench.deleteProfile(pendingDelete.id)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmRun} onOpenChange={setConfirmRun}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run on {activeProfile?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This connection is marked as production and the statement can change or delete data.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={startRun}>Run</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <SettingsSheet open={aiSettingsOpen} onOpenChange={setAiSettingsOpen} />
      <Toaster />
    </TooltipProvider>
  );
}
