import { ChevronRight, Copy, Eye, KeyRound, Layers, Play, RefreshCw, Search, Table2, TextCursorInput, X, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { SchemaState } from "../hooks/useSchema";
import type { SchemaObject } from "../types";
import { IconAction } from "./Hint";
import { InlineError } from "./InlineError";
import { StateMessage } from "./StateMessage";

interface SchemaPanelProps {
  state: SchemaState;
  profileId: string | null;
  connected: boolean;
  canSelectRows: (object: SchemaObject) => boolean;
  onSelectRows: (object: SchemaObject) => void;
  onInsertName: (name: string) => void;
}

const SKELETON_ROWS = 6;

const KIND_ICONS: Record<string, LucideIcon> = {
  table: Table2,
  view: Eye,
  index: KeyRound,
  collection: Layers,
  key: KeyRound,
};

const kindIcon = (kind: string) => KIND_ICONS[kind.toLowerCase()] ?? Table2;

function SchemaObjectRow({ object, open, onOpenChange, canSelectRows, onSelectRows, onInsertName }: {
  object: SchemaObject;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canSelectRows: boolean;
  onSelectRows: (object: SchemaObject) => void;
  onInsertName: (name: string) => void;
}) {
  const expandable = object.columns.length > 0;
  const KindIcon = kindIcon(object.kind);
  const copyName = () => navigator.clipboard.writeText(object.name).then(() => toast.success(`Copied ${object.name}`));
  return (
    <Collapsible open={open && expandable} onOpenChange={onOpenChange}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <CollapsibleTrigger
            onDoubleClick={() => onInsertName(object.name)}
            className="group flex h-7 w-full items-center gap-1.5 rounded-md pl-1 pr-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <ChevronRight aria-hidden className={cn("size-3 shrink-0 text-muted-foreground/70 transition-transform duration-100 ease-out group-hover:text-muted-foreground", open && "rotate-90", !expandable && "invisible")} />
            <KindIcon aria-hidden className={cn("size-3 shrink-0", expandable ? "text-muted-foreground" : "text-muted-foreground/60")} />
            <span className={cn("min-w-0 flex-1 truncate", object.kind.toLowerCase() === "table" ? "font-medium" : "text-foreground/80")}>{object.name}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{object.kind}</span>
          </CollapsibleTrigger>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-44">
          <ContextMenuItem disabled={!canSelectRows} onSelect={() => onSelectRows(object)}>
            <Play className="mr-2 size-3.5" />
            Select rows
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onInsertName(object.name)}>
            <TextCursorInput className="mr-2 size-3.5" />
            Insert name
          </ContextMenuItem>
          <ContextMenuItem onSelect={copyName}>
            <Copy className="mr-2 size-3.5" />
            Copy name
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <CollapsibleContent>
        <ul className="ml-4 border-l pb-1 pl-1">
          {object.columns.map((column) => (
            <li key={column.name} className="flex h-6 items-center gap-1.5 rounded-sm pl-2 pr-2 text-sm hover:bg-accent/60">
              <span className={cn("min-w-0 flex-1 truncate", column.primaryKey && "font-medium")}>{column.name}</span>
              {column.primaryKey && (
                <>
                  <KeyRound aria-hidden className="size-3 shrink-0 text-primary" />
                  <span className="sr-only">primary key</span>
                </>
              )}
              <span className="max-w-[45%] truncate font-mono text-[10px] text-muted-foreground">{column.typeName}</span>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function SchemaPanel({ state, profileId, connected, canSelectRows, onSelectRows, onInsertName }: SchemaPanelProps) {
  const { schema, error, loading, reload } = state;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const filterRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setExpanded(new Set());
    setFilter("");
  }, [profileId, connected]);

  const objects = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return schema?.objects.filter((object) => object.name.toLowerCase().includes(needle)) ?? [];
  }, [schema, filter]);

  const setOpen = (name: string, open: boolean) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (open) next.add(name);
      else next.delete(name);
      return next;
    });

  const hasObjects = Boolean(schema?.objects.length);

  return (
    <section aria-label="Schema" aria-busy={loading} className="flex h-full flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center gap-1.5 pl-3 pr-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Schema</h2>
        {hasObjects && <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">{schema?.objects.length}</span>}
        <IconAction label="Refresh schema" className="ml-auto" onClick={reload} disabled={!connected || loading}>
          <RefreshCw className={cn(loading && "animate-spin")} />
        </IconAction>
      </div>
      {hasObjects && (
        <div className="relative shrink-0 px-2 pb-2">
          <Search aria-hidden className="pointer-events-none absolute left-4 top-2 size-3 text-muted-foreground" />
          <Input
            id="schema-filter"
            ref={filterRef}
            aria-label="Filter tables"
            placeholder="Filter tables"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            onKeyDown={(event) => event.key === "Escape" && setFilter("")}
            className="h-7 pl-6 pr-6"
          />
          {filter && (
            <button
              type="button"
              aria-label="Clear filter"
              onClick={() => {
                setFilter("");
                filterRef.current?.focus();
              }}
              className="absolute right-3.5 top-1.5 grid size-4 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      )}
      <ScrollArea className="min-h-0 flex-1">
        {!connected && <StateMessage icon={Table2} title="Not connected" hint="Connect to browse tables." className="p-3" />}
        {connected && loading && !schema && (
          <div className="space-y-1.5 px-2 pb-2" aria-label="Loading schema">
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <Skeleton key={index} className="h-5" style={{ width: `${88 - ((index * 13) % 40)}%` }} />
            ))}
          </div>
        )}
        {error && <InlineError message={error} onRetry={reload} className="mx-2" />}
        {schema?.note && <p className="px-3 py-2 text-sm text-muted-foreground">{schema.note}</p>}
        {schema && !schema.note && !hasObjects && <p className="px-3 py-2 text-sm text-muted-foreground">Nothing to show.</p>}
        {hasObjects && objects.length === 0 && (
          <div className="flex flex-col items-start gap-2 px-3 py-2 text-sm text-muted-foreground">
            No match for "{filter}".
            <button type="button" onClick={() => setFilter("")} className="text-xs font-medium text-primary hover:underline">
              Clear filter
            </button>
          </div>
        )}
        {objects.length > 0 && (
          <ul className="px-1.5 pb-2" aria-label="Schema objects">
            {objects.map((object) => (
              <li key={object.name}>
                <SchemaObjectRow
                  object={object}
                  open={expanded.has(object.name)}
                  onOpenChange={(open) => setOpen(object.name, open)}
                  canSelectRows={canSelectRows(object)}
                  onSelectRows={onSelectRows}
                  onInsertName={onInsertName}
                />
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </section>
  );
}
