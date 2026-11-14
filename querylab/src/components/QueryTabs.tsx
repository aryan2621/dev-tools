import { ChevronDown, Loader2, Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SHORTCUTS } from "../lib/shortcuts";
import { Hint, IconAction } from "./Hint";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TabItem {
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
  onRename: (id: string, title: string) => void;
  children: ReactNode;
}

export function QueryTabs({ tabs, activeId, onSelect, onClose, onNew, onRename, children }: QueryTabsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const finishRename = (id: string, title: string) => {
    setRenaming(null);
    if (title.trim()) onRename(id, title.trim());
  };

  useEffect(() => {
    listRef.current?.querySelector("[data-state=active]")?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [activeId]);

  return (
    <Tabs value={activeId ?? ""} onValueChange={onSelect} className="flex min-h-0 flex-1 flex-col">
      <div data-tauri-drag-region className="flex h-10 shrink-0 items-center border-b bg-sidebar px-1.5">
        <TabsList ref={listRef} aria-label="Query tabs" className="h-full min-w-0 items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={cn(
                "group flex h-8 max-w-[210px] shrink-0 items-center gap-0.5 rounded-md border border-transparent pl-2.5 pr-0.5 text-muted-foreground transition-colors duration-75 hover:bg-accent hover:text-foreground has-[button:focus-visible]:bg-accent",
                "has-[[data-state=active]]:border-border has-[[data-state=active]]:bg-background has-[[data-state=active]]:text-foreground",
              )}
            >
              <TabsTrigger
                value={tab.id}
                onKeyDown={(event) => event.key === "Delete" && onClose(tab.id)}
                onAuxClick={(event) => event.button === 1 && onClose(tab.id)}
                className="h-full min-w-0 gap-1.5 border-b-0 px-0 focus-visible:ring-0 data-[state=active]:border-b-0"
              >
                {renaming === tab.id ? (
                  <input
                    autoFocus
                    aria-label="Tab name"
                    defaultValue={tab.title}
                    onFocus={(event) => event.target.select()}
                    onBlur={(event) => finishRename(tab.id, event.target.value)}
                    onKeyUp={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") setRenaming(null);
                    }}
                    className="h-5 w-28 min-w-0 rounded-sm border bg-background px-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                ) : (
                  <span className="truncate" onDoubleClick={() => setRenaming(tab.id)}>
                    {tab.title}
                  </span>
                )}
                {tab.busy && <Loader2 aria-label="Running" className="size-3 shrink-0 animate-spin text-primary" />}
              </TabsTrigger>
              <IconAction
                label={`Close ${tab.title}`}
                tabIndex={-1}
                className="size-5 shrink-0 text-muted-foreground opacity-0 hover:text-foreground group-has-[[data-state=active]]:opacity-60 focus-visible:opacity-100 group-hover:opacity-100"
                onClick={() => onClose(tab.id)}
              >
                <X className="size-3" />
              </IconAction>
            </div>
          ))}
        </TabsList>
        <div className="ml-1 flex shrink-0 items-center gap-0.5">
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
