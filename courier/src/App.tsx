import { Columns2, Rows2 } from "lucide-react";
import { useEffect, useState } from "react";
import { IconAction } from "@/components/IconAction";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AgentPanel } from "./features/ai/AgentPanel";
import { AgentProvider, useAgent } from "./features/ai/useAgent";
import { CommandPalette } from "./features/CommandPalette";
import { EmptyWorkspace } from "./features/EmptyWorkspace";
import { EnvironmentSwitcher } from "./features/EnvironmentSwitcher";
import { EnvironmentsSheet } from "./features/EnvironmentsSheet";
import { ImportDialog } from "./features/ImportDialog";
import { SettingsSheet } from "./features/SettingsSheet";
import { SidebarFooter } from "./features/SidebarFooter";
import { RequestEditor } from "./features/RequestEditor";
import { RequestTabs } from "./features/RequestTabs";
import { ResponsePane } from "./features/ResponsePane";
import { type Panel, Sidebar } from "./features/Sidebar";
import { isMac } from "./platform";
import { CourierProvider, useCourier } from "./store";

function Workspace() {
  const courier = useCourier();
  const { selected, responses, sending } = courier;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [environmentsOpen, setEnvironmentsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>("collections");
  const [sidePref, setSide] = useState(
    () =>
      (localStorage.getItem("courier:split") ??
        (window.innerWidth >= 1280 ? "side" : "stack")) === "side",
  );
  const agent = useAgent();
  // shortcut: stack whenever the assistant is open, three columns squeeze the response; remember the preference
  const side = sidePref && !agent.open;

  const toggleSplit = () => {
    localStorage.setItem("courier:split", sidePref ? "stack" : "side");
    setSide(!sidePref);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(isMac ? event.metaKey : event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "enter" && selected) courier.send(selected.id);
      else if (key === "k") setPaletteOpen((open) => !open);
      else if (key === "n") {
        if (
          event.target instanceof HTMLElement &&
          event.target.closest("input, textarea, .cm-editor")
        )
          return;
        courier.startRequest();
      } else if (key === "w" && selected) courier.closeTab(selected.id);
      else if (key === "j") agent.setOpen(!agent.open);
      else if (key === "1") setPanel("collections");
      else if (key === "2") setPanel("history");
      else if (key === "l") document.getElementById("request-url")?.focus();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [selected, courier, agent]);

  if (courier.loadError) {
    return (
      <div
        role="alert"
        className="flex h-screen flex-col items-start justify-center gap-3 bg-background px-10 text-foreground"
      >
        <h1 className="text-base font-semibold">
          Could not load your workspace
        </h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          {courier.loadError}
        </p>
        <Button onClick={courier.retryLoad}>Retry</Button>
      </div>
    );
  }

  if (!courier.ready) return null;

  const openImport = () => setImportOpen(true);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div className="flex min-h-0 flex-1">
        <ResizablePanelGroup
          direction="horizontal"
          autoSaveId="courier:layout"
          className="min-h-0 flex-1"
        >
          <ResizablePanel
            id="sidebar"
            order={1}
            defaultSize={22}
            minSize={20}
            maxSize={32}
          >
            <Sidebar
              onImport={openImport}
              panel={panel}
              onPanel={setPanel}
              footer={
                <SidebarFooter
                  assistantOpen={agent.open}
                  onAssistant={() => agent.setOpen(!agent.open)}
                  onSettings={() => setSettingsOpen(true)}
                  onPalette={() => setPaletteOpen(true)}
                />
              }
            />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="main" order={2} minSize={40}>
            <main className="flex h-full min-h-0 flex-col">
              <header
                data-tauri-drag-region
                className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-sidebar pl-2 pr-2"
              >
                <RequestTabs />
                {!agent.open && (
                  <IconAction
                    icon={side ? Rows2 : Columns2}
                    label={
                      side
                        ? "Stack request above response"
                        : "Place response beside request"
                    }
                    onClick={toggleSplit}
                  />
                )}
                <EnvironmentSwitcher
                  onManage={() => setEnvironmentsOpen(true)}
                />
              </header>
              {selected ? (
                <ResizablePanelGroup
                  key={side ? "side" : "stack"}
                  direction={side ? "horizontal" : "vertical"}
                  autoSaveId={side ? "courier:editor-side" : "courier:editor-v3"}
                  className="min-h-0 flex-1"
                >
                  <ResizablePanel
                    id="request"
                    order={1}
                    defaultSize={side ? 55 : 38}
                    minSize={20}
                  >
                    <RequestEditor key={selected.id} request={selected} />
                  </ResizablePanel>
                  <ResizableHandle />
                  <ResizablePanel id="response" order={2} minSize={15}>
                    <ResponsePane
                      requestId={selected.id}
                      response={responses[selected.id]}
                      sending={sending[selected.id] === true}
                    />
                  </ResizablePanel>
                </ResizablePanelGroup>
              ) : (
                <EmptyWorkspace onImport={openImport} />
              )}
            </main>
          </ResizablePanel>
          {agent.open && (
            <>
              <ResizableHandle />
              <ResizablePanel
                id="assistant"
                order={3}
                defaultSize={26}
                minSize={20}
                maxSize={45}
              >
                <AgentPanel onSettings={() => setSettingsOpen(true)} />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onImport={openImport}
        onSettings={() => setSettingsOpen(true)}
        onEnvironments={() => setEnvironmentsOpen(true)}
      />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <EnvironmentsSheet
        open={environmentsOpen}
        onOpenChange={setEnvironmentsOpen}
      />
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
      <Toaster />
    </div>
  );
}

export default function App() {
  return (
    <TooltipProvider delayDuration={400}>
      <CourierProvider>
        <AgentProvider>
          <Workspace />
        </AgentProvider>
      </CourierProvider>
    </TooltipProvider>
  );
}
