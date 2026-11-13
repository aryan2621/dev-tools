import { ChevronDown, Loader2, Plus, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SHORTCUTS } from "../lib/shortcuts";
import { Hint, IconAction } from "./Hint";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  title: string;
  busy: boolean;
}

interface QueryTabsProps {
  tabs: TabItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  children: ReactNode;
}

export function QueryTabs({ tabs, activeId, onSelect, onClose, onNew, children }: QueryTabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.querySelector("[data-state=active]")?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [activeId]);

  return (
    <Tabs value={activeId ?? ""} onValueChange={onSelect} className="flex min-h-0 flex-1 flex-col">
      <div data-tauri-drag-region className="flex h-9 shrink-0 items-stretch border-b bg-sidebar pl-1 pr-1">
        <TabsList ref={listRef} aria-label="Query tabs" className="h-full min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={cn(
                "group flex h-full max-w-[210px] shrink-0 items-center gap-0.5 border-b-2 border-transparent pl-3 pr-1 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground",
                "has-[[data-state=active]]:border-b-primary has-[[data-state=active]]:bg-background has-[[data-state=active]]:text-foreground",
              )}
            >
              <TabsTrigger
                value={tab.id}
                onKeyDown={(event) => event.key === "Delete" && onClose(tab.id)}
                onAuxClick={(event) => event.button === 1 && onClose(tab.id)}
                className="h-full min-w-0 gap-1.5 px-0"
              >
                <span className="truncate">{tab.title}</span>
                {tab.busy && <Loader2 aria-label="Running" className="size-3 shrink-0 animate-spin text-primary" />}
              </TabsTrigger>
              <IconAction
                label={`Close ${tab.title}`}
                tabIndex={-1}
                className="size-5 shrink-0 text-muted-foreground opacity-40 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                onClick={() => onClose(tab.id)}
              >
                <X className="size-3" />
              </IconAction>
            </div>
          ))}
        </TabsList>
        <div className="ml-1 flex shrink-0 items-center gap-0.5 pb-0.5">
          <IconAction label="New tab" keys={SHORTCUTS.newTab} onClick={onNew}>
            <Plus />
          </IconAction>
          {tabs.length > 1 && (
            <DropdownMenu>
              <Hint label="All tabs">
                <DropdownMenuTrigger asChild>
                  <Button size="iconSm" variant="ghost" aria-label="All tabs">
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
              </Hint>
              <DropdownMenuContent align="end" className="max-h-72 w-56 overflow-y-auto">
                <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wider">Open tabs</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={activeId ?? ""} onValueChange={onSelect}>
                  {tabs.map((tab) => (
                    <DropdownMenuRadioItem key={tab.id} value={tab.id}>
                      <span className="truncate">{tab.title}</span>
                      {tab.busy && <Loader2 aria-label="Running" className="ml-auto size-3 animate-spin text-primary" />}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      {activeId && (
        <TabsContent value={activeId} className="flex min-h-0 flex-1 flex-col">
          {children}
        </TabsContent>
      )}
    </Tabs>
  );
}
