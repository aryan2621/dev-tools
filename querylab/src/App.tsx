import { Database, Play, Plus, RefreshCw, Search, SquarePen, Table2, Unplug, X, Plug } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { IconAction } from "./components/Hint";
import { CommandPicker, type PickerGroup } from "./components/CommandPicker";
import { ConnectionForm } from "./components/ConnectionForm";
import { ConnectionList } from "./components/ConnectionList";
import { connectionPhase } from "./components/ConnectionState";
import { QueryTabs } from "./components/QueryTabs";
import { SchemaPanel } from "./components/SchemaPanel";
import { StatusBar } from "./components/StatusBar";
import { Welcome } from "./components/Welcome";
import { Workspace } from "./components/Workspace";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSchema } from "./hooks/useSchema";
import { useWorkbench } from "./hooks/useWorkbench";
import { SHORTCUTS } from "./lib/shortcuts";
import { selectRowsDraft } from "./lib/templates";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { Profile, SchemaObject } from "./types";

type PickerKind = "commands" | "switcher";

const PICKERS: Record<PickerKind, { title: string; placeholder: string }> = {
  commands: { title: "Command palette", placeholder: "Type a command" },
  switcher: { title: "Quick switcher", placeholder: "Switch connection or open table" },
};

const DDL_PATTERN = /^\s*(create|alter|drop|rename)\b/i;

export default function App() {
  const bench = useWorkbench();
  const { activeProfile, activeEngine, activeTab } = bench;
  const [pendingDelete, setPendingDelete] = useState<Profile | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [presetEngine, setPresetEngine] = useState<string | undefined>();
  const [picker, setPicker] = useState<PickerKind | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const selectionRef = useRef("");

  const live = activeProfile ? bench.connected.has(activeProfile.id) : false;
  const schemaState = useSchema(activeProfile?.id ?? null, live);
  const phase = connectionPhase(live, activeProfile ? bench.connecting.has(activeProfile.id) : false);

  const runActive = useCallback(() => {
    if (!activeTab || !live) return;
    const input = selectionRef.current.trim() || activeTab.input;
    bench.run(activeTab, selectionRef.current).then(() => {
      if (DDL_PATTERN.test(input)) schemaState.reload();
    });
  }, [activeTab, live, bench.run, schemaState.reload]);

  const openForm = useCallback((profile: Profile | null, engineKind?: string) => {
    setEditing(profile);
    setPresetEngine(engineKind);
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
      if (draft && activeProfile) bench.newTab(activeProfile.id, draft);
    },
    [activeEngine, activeProfile, bench.newTab],
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
  }, [picker, connectionItems, schemaState.schema, schemaState.reload, selectRows, runActive, activeProfile, activeTab, live, openForm, bench.newTab, bench.closeTab, bench.connect, bench.disconnect]);

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
        enter: runActive,
        t: () => activeProfile && bench.newTab(activeProfile.id),
        w: () => activeTab && bench.closeTab(activeTab.id),
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
  }, [runActive, activeProfile, activeTab, bench.tabs, bench.selectTab, bench.newTab, bench.closeTab]);

  const showWorkspace = activeProfile && bench.tabs.length > 0 && activeTab;

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-screen w-screen flex-col">
        <ResizablePanelGroup direction="horizontal" autoSaveId="querylab-layout" className="min-h-0 flex-1">
          <ResizablePanel id="sidebar" order={1} defaultSize={20} minSize={15} maxSize={32} className="flex flex-col bg-sidebar">
            <div data-tauri-drag-region className="flex h-9 shrink-0 items-center gap-2 border-b pl-[76px] pr-2">
              <span aria-hidden className="grid size-5 place-items-center rounded-md bg-primary/10 text-primary">
                <Database className="size-3" />
              </span>
              <span className="text-xs font-semibold tracking-tight">QueryLab</span>
              <IconAction label="Commands" keys={SHORTCUTS.palette} className="ml-auto" onClick={() => setPicker("commands")}>
                <Search />
              </IconAction>
            </div>
            <ResizablePanelGroup direction="vertical" autoSaveId="querylab-sidebar" className="min-h-0 flex-1">
              <ResizablePanel id="connections" order={1} defaultSize={40} minSize={15}>
                <ConnectionList
                  profiles={bench.profiles}
                  engineFor={bench.engineFor}
                  activeId={activeProfile?.id ?? null}
                  connected={bench.connected}
                  connecting={bench.connecting}
                  loading={bench.loading}
                  onSelect={bench.setActiveProfileId}
                  onConnect={bench.connect}
                  onDisconnect={bench.disconnect}
                  onEdit={openForm}
                  onDelete={setPendingDelete}
                  onAdd={() => openForm(null)}
                />
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel id="schema" order={2} defaultSize={60} minSize={15}>
                <SchemaPanel
                  state={schemaState}
                  profileId={activeProfile?.id ?? null}
                  connected={live}
                  canSelectRows={(object) => Boolean(activeEngine && selectRowsDraft(activeEngine, object))}
                  onSelectRows={selectRows}
                  onInsertName={insertName}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="main" order={2} defaultSize={80} minSize={40}>
            <main className="flex h-full min-w-0 flex-col bg-background">
              {showWorkspace ? (
                <QueryTabs
                  tabs={bench.tabs.map((tab) => ({ id: tab.id, title: tab.title, busy: tab.runId !== null }))}
                  activeId={activeTab.id}
                  onSelect={bench.selectTab}
                  onClose={bench.closeTab}
                  onNew={() => bench.newTab(activeProfile.id)}
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
                    rowLimit={bench.rowLimit}
                    onRowLimit={bench.setRowLimit}
                  />
                </QueryTabs>
              ) : (
                <Welcome
                  engines={bench.engines}
                  profile={activeProfile}
                  live={live}
                  loading={bench.loading}
                  onNewConnection={(engineKind) => openForm(null, engineKind)}
                  onConnect={bench.connect}
                  onNewTab={(id) => bench.newTab(id)}
                />
              )}
            </main>
          </ResizablePanel>
        </ResizablePanelGroup>
        <StatusBar profile={activeProfile} engine={activeEngine} phase={phase} running={activeTab?.runId != null} />
      </div>
      <ConnectionForm open={formOpen} engines={bench.engines} initial={editing} engineKind={presetEngine} onClose={() => setFormOpen(false)} onSave={bench.saveProfile} />
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
      <Toaster />
    </TooltipProvider>
  );
}
