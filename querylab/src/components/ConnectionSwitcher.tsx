import { ChevronsUpDown, Copy, Pencil, Plug, Plus, Trash2, Unplug } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { EngineMeta, Profile } from "../types";
import { connectionPhase, PhaseDot } from "./ConnectionState";
import { EngineMark } from "./EngineMark";

interface ConnectionSwitcherProps {
  profiles: Profile[];
  engineFor: (profile: Profile) => EngineMeta | undefined;
  active: Profile | undefined;
  connected: Set<string>;
  connecting: Set<string>;
  onSelect: (id: string) => void;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onEdit: (profile: Profile) => void;
  onDuplicate: (profile: Profile) => void;
  onDelete: (profile: Profile) => void;
  onAdd: () => void;
}

export function ConnectionSwitcher({ profiles, engineFor, active, connected, connecting, onSelect, onConnect, onDisconnect, onEdit, onDuplicate, onDelete, onAdd }: ConnectionSwitcherProps) {
  const phaseOf = (profile: Profile) => connectionPhase(connected.has(profile.id), connecting.has(profile.id));
  const live = active ? connected.has(active.id) : false;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-10 w-full items-center gap-2 rounded-md border bg-background px-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <EngineMark engine={active && engineFor(active)} className="size-6 rounded-md [&_svg]:size-3.5" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium leading-4">{active?.name ?? "No connection"}</span>
          <span className="block truncate text-xs text-muted-foreground">{active ? (engineFor(active)?.displayName ?? active.engine) : "Add a database"}</span>
        </span>
        {active && <PhaseDot phase={phaseOf(active)} />}
        <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {profiles.length > 0 && <DropdownMenuLabel>Connections</DropdownMenuLabel>}
        {profiles.map((profile) => (
          <DropdownMenuItem
            key={profile.id}
            onSelect={() => {
              onSelect(profile.id);
              if (!connected.has(profile.id)) onConnect(profile.id);
            }}
          >
            <PhaseDot phase={phaseOf(profile)} className="mr-2" />
            <span className="min-w-0 flex-1 truncate">{profile.name}</span>
            <span className="ml-2 text-xs text-muted-foreground">{engineFor(profile)?.displayName ?? profile.engine}</span>
          </DropdownMenuItem>
        ))}
        {active && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => (live ? onDisconnect(active.id) : onConnect(active.id))}>
              {live ? <Unplug className="mr-2 size-3.5" /> : <Plug className="mr-2 size-3.5" />}
              {live ? "Disconnect" : "Connect"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onEdit(active)}>
              <Pencil className="mr-2 size-3.5" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onDuplicate(active)}>
              <Copy className="mr-2 size-3.5" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onDelete(active)}>
              <Trash2 className="mr-2 size-3.5" />
              Delete
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onAdd}>
          <Plus className="mr-2 size-3.5" />
          New connection
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
