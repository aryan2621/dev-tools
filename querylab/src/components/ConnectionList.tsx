import { Database, Pencil, Plug, PlugZap, Plus, Trash2, Unplug } from "lucide-react";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EngineMeta, Profile } from "../types";
import { connectionPhase, phaseLabel, PhaseDot } from "./ConnectionState";
import { EngineMark } from "./EngineMark";
import { IconAction } from "./Hint";

interface ConnectionListProps {
  profiles: Profile[];
  engineFor: (profile: Profile) => EngineMeta | undefined;
  activeId: string | null;
  connected: Set<string>;
  connecting: Set<string>;
  loading: boolean;
  onSelect: (id: string) => void;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onEdit: (profile: Profile) => void;
  onDelete: (profile: Profile) => void;
  onAdd: () => void;
}

export function ConnectionList({ profiles, engineFor, activeId, connected, connecting, loading, onSelect, onConnect, onDisconnect, onEdit, onDelete, onAdd }: ConnectionListProps) {
  const liveCount = profiles.filter((profile) => connected.has(profile.id)).length;

  return (
    <section aria-label="Connections" className="flex h-full flex-col bg-sidebar">
      <div className="flex h-9 shrink-0 items-center gap-1.5 pl-3 pr-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Connections</h2>
        {profiles.length > 0 && (
          <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground" title={`${liveCount} connected`}>
            {liveCount > 0 ? `${liveCount}/${profiles.length}` : profiles.length}
          </span>
        )}
        <IconAction label="New connection" className="ml-auto" onClick={onAdd}>
          <Plus />
        </IconAction>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {profiles.length === 0 ? (
          loading ? (
            <div className="space-y-1.5 px-2 pb-2" aria-busy>
              <Skeleton className="h-11 rounded-lg" />
              <Skeleton className="h-11 rounded-lg" />
            </div>
          ) : (
            <div className="mx-2 mt-1 flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-6 text-center">
              <span className="grid size-8 place-items-center rounded-full bg-muted text-muted-foreground">
                <Database aria-hidden className="size-4" />
              </span>
              <div className="flex flex-col gap-0.5">
                <p className="font-medium">No connections yet</p>
                <p className="text-xs text-muted-foreground">Add a database to get started.</p>
              </div>
              <Button size="sm" onClick={onAdd}>
                <Plus />
                New connection
              </Button>
            </div>
          )
        ) : (
          <ul className="flex flex-col gap-0.5 px-1.5 pb-2">
            {profiles.map((profile) => {
              const live = connected.has(profile.id);
              const phase = connectionPhase(live, connecting.has(profile.id));
              const active = profile.id === activeId;
              const engine = engineFor(profile);
              return (
                <li key={profile.id}>
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <div
                        className={cn(
                          "group relative flex min-h-[46px] items-center gap-2 rounded-lg pr-1 transition-colors",
                          active ? "bg-background shadow-sm ring-1 ring-border/80" : "hover:bg-accent/70",
                        )}
                      >
                        {active && <span aria-hidden className="absolute inset-y-2.5 left-0 w-0.5 rounded-r-full bg-primary" />}
                        <button
                          type="button"
                          aria-current={active}
                          onClick={() => onSelect(profile.id)}
                          onDoubleClick={() => !live && onConnect(profile.id)}
                          className="flex min-w-0 flex-1 items-center gap-2 self-stretch rounded-lg px-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        >
                          <EngineMark engine={engine} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-base font-medium leading-5">{profile.name}</span>
                            <span className="flex items-center gap-1 truncate text-[11px] leading-4 text-muted-foreground">
                              <PhaseDot phase={phase} className="size-1.5" />
                              <span className="truncate">{engine?.displayName ?? profile.engine}</span>
                              <span aria-hidden className="shrink-0 opacity-50 max-[1024px]:hidden">
                                ·
                              </span>
                              <span className="shrink-0 max-[1024px]:hidden">{phaseLabel(phase)}</span>
                              <span className="sr-only">{phaseLabel(phase)}</span>
                            </span>
                          </span>
                        </button>
                        <IconAction
                          label={live ? `Disconnect ${profile.name}` : `Connect ${profile.name}`}
                          disabled={phase === "connecting"}
                          className="opacity-0 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
                          onClick={() => (live ? onDisconnect(profile.id) : onConnect(profile.id))}
                        >
                          {live ? <Unplug /> : <Plug />}
                        </IconAction>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-44">
                      {live ? (
                        <ContextMenuItem onSelect={() => onDisconnect(profile.id)}>
                          <Unplug className="mr-2 size-3.5" />
                          Disconnect
                        </ContextMenuItem>
                      ) : (
                        <ContextMenuItem onSelect={() => onConnect(profile.id)}>
                          <PlugZap className="mr-2 size-3.5" />
                          Connect
                        </ContextMenuItem>
                      )}
                      <ContextMenuItem onSelect={() => onEdit(profile)}>
                        <Pencil className="mr-2 size-3.5" />
                        Edit...
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem className="text-destructive focus:text-destructive" onSelect={() => onDelete(profile)}>
                        <Trash2 className="mr-2 size-3.5" />
                        Delete
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </section>
  );
}
