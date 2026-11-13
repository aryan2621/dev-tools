import { Code2, FileText, FolderPlus, History, Layers, Plus, Send, Settings2, Sparkles, Upload, type LucideIcon } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { commands } from "@/commands";
import { Shortcut } from "@/components/Shortcut";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { copyWithToast } from "@/notify";
import { modSymbol } from "@/platform";
import { useCourier } from "@/store";
import { useAgent } from "./ai/useAgent";
import { locateAll } from "@/tree";
import { CODE_LABELS, type CodeTarget, type HistoryEntry } from "@/types";

interface PaletteEntry {
  id: string;
  label: string;
  hint?: string;
  keys?: string[];
  icon: LucideIcon;
  run: () => void | Promise<unknown>;
}

interface PaletteGroup {
  heading: string;
  entries: PaletteEntry[];
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: () => void;
  onSettings: () => void;
  onEnvironments: () => void;
}

export function CommandPalette({ open, onOpenChange, onImport, onSettings, onEnvironments }: CommandPaletteProps) {
  const courier = useCourier();
  const agent = useAgent();
  const { selected, collections, environments } = courier;
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    if (open) commands.listHistory().then(setHistory);
  }, [open]);

  const groups = useMemo<PaletteGroup[]>(
    () => [
      {
        heading: "Actions",
        entries: [
          { id: "new-request", label: "New request", icon: Plus, keys: [modSymbol, "N"], run: courier.startRequest },
          { id: "new-collection", label: "New collection", icon: FolderPlus, run: courier.addCollection },
          { id: "import", label: "Import cURL", icon: Upload, run: onImport },
          { id: "assistant", label: "Open assistant", icon: Sparkles, keys: [modSymbol, "J"], run: () => agent.setOpen(true) },
          { id: "environments", label: "Manage environments", icon: Layers, run: onEnvironments },
      { id: "settings", label: "Settings", icon: Settings2, run: onSettings },
          ...(selected
            ? [
                { id: "send", label: "Send request", icon: Send, keys: [modSymbol, "Enter"], run: () => courier.send(selected.id) },
                ...(Object.keys(CODE_LABELS) as CodeTarget[]).map((target) => ({
                  id: `code-${target}`,
                  label: `Copy as ${CODE_LABELS[target]}`,
                  icon: Code2,
                  run: async () => copyWithToast(await commands.generateCode(target, selected, courier.variables), "Code copied"),
                })),
              ]
            : []),
        ],
      },
      {
        heading: "Environments",
        entries: environments.map((environment) => ({
          id: `env-${environment.id}`,
          label: `Switch environment: ${environment.name}`,
          icon: Layers,
          run: () => courier.setActiveEnvironmentId(environment.id),
        })),
      },
      {
        heading: "Requests",
        entries: locateAll(collections).map(({ request, collection }) => ({
          id: `go-${request.id}`,
          label: `Go to ${request.name}`,
          hint: collection.name,
          icon: FileText,
          run: () => courier.select(request.id),
        })),
      },
      {
        heading: "History",
        entries: history.map((entry) => ({
          id: `history-${entry.id}`,
          label: `${entry.request.method} ${entry.request.url}`,
          hint: String(entry.status),
          icon: History,
          run: () => courier.openHistory(entry),
        })),
      },
    ],
    [collections, environments, selected, history, courier, agent, onImport, onSettings],
  );

  const choose = (entry: PaletteEntry) => {
    onOpenChange(false);
    void entry.run();
  };

  const row = (entry: PaletteEntry): ReactNode => (
    <CommandItem key={entry.id} value={`${entry.label} ${entry.hint ?? ""} ${entry.id}`} onSelect={() => choose(entry)}>
      <entry.icon aria-hidden="true" className="text-muted-foreground" />
      <span className="truncate">{entry.label}</span>
      <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
        {entry.hint}
        {entry.keys && <Shortcut keys={entry.keys} />}
      </span>
    </CommandItem>
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search" aria-label="Command" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {groups
          .filter((group) => group.entries.length > 0)
          .map((group) => (
            <CommandGroup key={group.heading} heading={group.heading}>
              {group.entries.map(row)}
            </CommandGroup>
          ))}
      </CommandList>
      <div className="flex items-center gap-3 border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          Navigate
        </span>
        <span className="flex items-center gap-1">
          <Kbd>↵</Kbd>
          Select
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Kbd>esc</Kbd>
          Close
        </span>
      </div>
    </CommandDialog>
  );
}
