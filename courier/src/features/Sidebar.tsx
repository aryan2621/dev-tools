import {
  Boxes,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Plus,
  Search,
  SearchX,
  Upload,
  X,
} from "lucide-react";
import {
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
  useRef,
  useState,
} from "react";
import { IconAction } from "@/components/IconAction";
import { MethodBadge } from "@/components/MethodBadge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { isMac } from "@/platform";
import { useCourier } from "@/store";
import { locate } from "@/tree";
import type { Collection, SavedRequest } from "@/types";
import { HistoryPanel } from "./HistoryPanel";
import {
  type SidebarAction,
  SidebarDialogs,
  type Target,
} from "./SidebarDialogs";

interface NodeAction {
  label: string;
  danger?: boolean;
  separated?: boolean;
  onSelect: () => void;
}

type MenuItemComponent = ComponentType<{
  onSelect: () => void;
  className?: string;
  children: ReactNode;
}>;
type SeparatorComponent = ComponentType<Record<string, never>>;

function ActionItems({
  actions,
  Item,
  Separator,
}: {
  actions: NodeAction[];
  Item: MenuItemComponent;
  Separator: SeparatorComponent;
}) {
  return actions.map((action) => (
    <div key={action.label} className="contents">
      {action.separated && <Separator />}
      <Item
        onSelect={action.onSelect}
        className={
          action.danger ? "text-destructive focus:text-destructive" : undefined
        }
      >
        {action.label}
      </Item>
    </div>
  ));
}

interface RowProps {
  depth: number;
  name: string;
  active?: boolean;
  tabbable: boolean;
  onClick: () => void;
  onFocus: () => void;
  expanded?: boolean;
  icon?: ReactNode;
  meta?: ReactNode;
  actions: NodeAction[];
  children: ReactNode;
}

function Row({
  depth,
  name,
  active,
  tabbable,
  onClick,
  onFocus,
  expanded,
  icon,
  meta,
  actions,
  children,
}: RowProps) {
  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger asChild>
        <li role="none" className="group relative px-1.5">
          <button
            type="button"
            role="treeitem"
            aria-level={depth + 1}
            aria-expanded={expanded}
            aria-selected={active ?? false}
            tabIndex={tabbable ? 0 : -1}
            onFocus={onFocus}
            onClick={onClick}
            style={{ paddingLeft: 6 + depth * 14 }}
            className={cn(
              "relative flex h-8 w-full items-center gap-1.5 rounded-md pr-8 text-left text-base transition-colors duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              active
                ? "bg-primary-soft font-medium text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {active && (
              <span
                aria-hidden="true"
                className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary"
              />
            )}
            {expanded === undefined ? null : expanded ? (
              <ChevronDown
                className="size-4 shrink-0 opacity-70"
                aria-hidden="true"
              />
            ) : (
              <ChevronRight
                className="size-4 shrink-0 opacity-70"
                aria-hidden="true"
              />
            )}
            {icon}
            {children}
            {meta && (
              <span className="ml-auto shrink-0 pr-0.5 font-mono text-xs tabular-nums text-muted-foreground/70 transition-opacity group-hover:opacity-0">
                {meta}
              </span>
            )}
          </button>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="iconSm"
                tabIndex={-1}
                aria-label={`Actions for ${name}`}
                className="absolute right-2 top-0.5 opacity-0 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <ActionItems
                actions={actions}
                Item={DropdownMenuItem}
                Separator={DropdownMenuSeparator}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ActionItems
          actions={actions}
          Item={ContextMenuItem}
          Separator={ContextMenuSeparator}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

const matchesRequest = (request: SavedRequest, query: string) =>
  `${request.method} ${request.name} ${request.url}`
    .toLowerCase()
    .includes(query);

const nameMatches = (name: string, query: string) =>
  name.toLowerCase().includes(query);

function filterCollections(
  collections: Collection[],
  query: string,
): Collection[] {
  if (!query) return collections;
  return collections.flatMap((collection) => {
    if (nameMatches(collection.name, query)) return [collection];
    const folders = collection.folders.flatMap((folder) => {
      if (nameMatches(folder.name, query)) return [folder];
      const requests = folder.requests.filter((request) =>
        matchesRequest(request, query),
      );
      return requests.length ? [{ ...folder, requests }] : [];
    });
    const requests = collection.requests.filter((request) =>
      matchesRequest(request, query),
    );
    return folders.length || requests.length
      ? [{ ...collection, folders, requests }]
      : [];
  });
}

export type Panel = "collections" | "history";

const PANELS: Panel[] = ["collections", "history"];

export function Sidebar({
  onImport,
  panel,
  onPanel,
  footer,
}: {
  onImport: () => void;
  panel: Panel;
  onPanel: (panel: Panel) => void;
  footer: ReactNode;
}) {
  const courier = useCourier();
  const { selected, select } = courier;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<SidebarAction | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const filterRef = useRef<HTMLInputElement>(null);

  const query = filter.trim().toLowerCase();
  const collections = filterCollections(courier.collections, query);
  const isOpen = (id: string) => query !== "" || !collapsed.has(id);

  const visibleIds = collections.flatMap((collection) =>
    isOpen(collection.id)
      ? [
          collection.id,
          ...collection.folders.flatMap((folder) =>
            isOpen(folder.id)
              ? [folder.id, ...folder.requests.map((request) => request.id)]
              : [folder.id],
          ),
          ...collection.requests.map((request) => request.id),
        ]
      : [collection.id],
  );
  const tabStop =
    [cursor, selected?.id].find((id) => id && visibleIds.includes(id)) ??
    visibleIds[0];

  const onTreeKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const item = event.target as HTMLElement;
    if (item.getAttribute("role") !== "treeitem") return;
    const items = [
      ...event.currentTarget.querySelectorAll<HTMLElement>("[role=treeitem]"),
    ];
    const index = items.indexOf(item);
    const expanded = item.getAttribute("aria-expanded");
    const targets: Record<string, HTMLElement | undefined> = {
      ArrowDown: items[Math.min(index + 1, items.length - 1)],
      ArrowUp: items[Math.max(index - 1, 0)],
      Home: items[0],
      End: items[items.length - 1],
    };
    if (event.key in targets) targets[event.key]?.focus();
    else if (
      (event.key === "ArrowRight" && expanded === "false") ||
      (event.key === "ArrowLeft" && expanded === "true")
    )
      item.click();
    else if (
      event.key === "ContextMenu" ||
      (event.key === "F10" && event.shiftKey)
    )
      item.parentElement
        ?.querySelector<HTMLElement>("[aria-haspopup=menu]")
        ?.click();
    else return;
    event.preventDefault();
  };

  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const nodeActions = (
    target: Target,
    extra: NodeAction[] = [],
  ): NodeAction[] => [
    ...extra,
    {
      label: "Rename",
      separated: extra.length > 0,
      onSelect: () => setAction({ type: "rename", target }),
    },
    {
      label: "Delete",
      danger: true,
      onSelect: () => setAction({ type: "delete", target }),
    },
  ];

  const duplicate = (request: SavedRequest) => {
    const place = locate(courier.collections, request.id);
    if (place)
      courier.addRequest(place.collection.id, place.folder?.id, {
        ...request,
        id: crypto.randomUUID(),
        name: `${request.name} copy`,
      });
  };

  const requestRow = (request: SavedRequest, depth: number) => {
    const target: Target = {
      kind: "request",
      id: request.id,
      name: request.name,
    };
    return (
      <Row
        key={request.id}
        depth={depth}
        name={request.name}
        active={selected?.id === request.id}
        tabbable={tabStop === request.id}
        onFocus={() => setCursor(request.id)}
        onClick={() => select(request.id)}
        actions={nodeActions(target, [
          { label: "Duplicate", onSelect: () => duplicate(request) },
          {
            label: "Move to",
            onSelect: () => setAction({ type: "move", target }),
          },
        ])}
      >
        <MethodBadge method={request.method} className="mr-0.5" />
        <span title={request.name} className="truncate">{request.name}</span>
      </Row>
    );
  };

  return (
    <aside
      aria-label="Collections"
      className="flex h-full min-h-0 flex-col bg-sidebar"
    >
      <div
        data-tauri-drag-region
        className={cn(
          "flex shrink-0 items-center gap-1 pb-2 pl-3 pr-2",
          isMac ? "h-[56px] items-end" : "h-12",
        )}
      >
        <Tabs
          value={panel}
          onValueChange={(next) => onPanel(next as Panel)}
          className="flex-1"
        >
          <TabsList aria-label="Sidebar view" className="w-full">
            {PANELS.map((name) => (
              <TabsTrigger
                key={name}
                value={name}
                className="flex-1 capitalize"
              >
                {name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <IconAction icon={Upload} label="Import" onClick={onImport} />
        <IconAction
          icon={Plus}
          label="New collection"
          onClick={courier.addCollection}
        />
      </div>
      <div
        role="tabpanel"
        aria-label={panel}
        className="flex min-h-0 flex-1 flex-col"
      >
        {panel === "history" ? (
          <HistoryPanel />
        ) : (
          <>
            {(filter !== "" ||
              courier.collections.reduce(
                (n, c) =>
                  n +
                  c.requests.length +
                  c.folders.reduce((m, f) => m + f.requests.length, 0),
                0,
              ) > 8) && (
              <div className="shrink-0 px-3 pb-2">
                <Label htmlFor="sidebar-filter" className="sr-only">
                  Filter requests
                </Label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-2 top-1.5 size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    ref={filterRef}
                    id="sidebar-filter"
                    type="search"
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    onKeyDown={(event) =>
                      event.key === "Escape" && setFilter("")
                    }
                    placeholder="Filter requests"
                    autoComplete="off"
                    className="pl-7 pr-7 [&::-webkit-search-cancel-button]:appearance-none"
                  />
                  {filter && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Clear filter"
                      onClick={() => {
                        setFilter("");
                        filterRef.current?.focus();
                      }}
                      className="absolute right-1 top-1 size-5"
                    >
                      <X aria-hidden="true" className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )}
            {courier.collections.length === 0 ? (
              <Empty className="px-4">
                <EmptyMedia>
                  <Boxes />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>No collections</EmptyTitle>
                  <EmptyDescription>
                    Create a collection to start saving requests.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={courier.addCollection}
                  >
                    <Plus aria-hidden="true" />
                    New collection
                  </Button>
                </EmptyContent>
              </Empty>
            ) : collections.length === 0 ? (
              <div
                role="status"
                className="flex flex-col items-center gap-2 px-4 py-8 text-center"
              >
                <span className="grid size-8 place-items-center rounded-full bg-muted text-muted-foreground">
                  <SearchX aria-hidden="true" className="size-4" />
                </span>
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-medium text-foreground">
                    No matches
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Nothing matches &ldquo;{filter.trim()}&rdquo;.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFilter("")}
                >
                  Clear filter
                </Button>
              </div>
            ) : (
              <ScrollArea className="min-h-0 flex-1">
                <ul
                  role="tree"
                  aria-label="Collections"
                  onKeyDown={onTreeKeyDown}
                  className="m-0 list-none p-0 pb-3"
                >
                  {collections.map((collection) => {
                    const open = isOpen(collection.id);
                    const count =
                      collection.requests.length +
                      collection.folders.reduce(
                        (total, folder) => total + folder.requests.length,
                        0,
                      );
                    return (
                      <li key={collection.id} role="none">
                        <ul role="group" className="m-0 list-none p-0">
                          <Row
                            depth={0}
                            name={collection.name}
                            tabbable={tabStop === collection.id}
                            onFocus={() => setCursor(collection.id)}
                            expanded={open}
                            icon={
                              <Boxes
                                aria-hidden="true"
                                className="size-4 shrink-0 text-muted-foreground"
                              />
                            }
                            meta={count > 0 ? count : undefined}
                            onClick={() => toggle(collection.id)}
                            actions={nodeActions(
                              {
                                kind: "collection",
                                id: collection.id,
                                name: collection.name,
                              },
                              [
                                {
                                  label: "New request",
                                  onSelect: () =>
                                    courier.addRequest(collection.id),
                                },
                                {
                                  label: "New folder",
                                  onSelect: () =>
                                    courier.addFolder(collection.id),
                                },
                                {
                                  label: "Variables",
                                  onSelect: () =>
                                    setAction({
                                      type: "variables",
                                      collectionId: collection.id,
                                    }),
                                },
                              ],
                            )}
                          >
                            <span className="truncate font-medium text-foreground">
                              {collection.name}
                            </span>
                          </Row>
                          {open &&
                            collection.folders.map((folder) => {
                              const folderOpen = isOpen(folder.id);
                              const FolderIcon = folderOpen
                                ? FolderOpen
                                : Folder;
                              return (
                                <li key={folder.id} role="none">
                                  <ul
                                    role="group"
                                    className="m-0 list-none p-0"
                                  >
                                    <Row
                                      depth={1}
                                      name={folder.name}
                                      tabbable={tabStop === folder.id}
                                      onFocus={() => setCursor(folder.id)}
                                      expanded={folderOpen}
                                      icon={
                                        <FolderIcon
                                          aria-hidden="true"
                                          className="size-4 shrink-0 text-muted-foreground"
                                        />
                                      }
                                      meta={
                                        folder.requests.length > 0
                                          ? folder.requests.length
                                          : undefined
                                      }
                                      onClick={() => toggle(folder.id)}
                                      actions={nodeActions(
                                        {
                                          kind: "folder",
                                          id: folder.id,
                                          name: folder.name,
                                        },
                                        [
                                          {
                                            label: "New request",
                                            onSelect: () =>
                                              courier.addRequest(
                                                collection.id,
                                                folder.id,
                                              ),
                                          },
                                        ],
                                      )}
                                    >
                                      <span className="truncate">
                                        {folder.name}
                                      </span>
                                    </Row>
                                    {folderOpen &&
                                      folder.requests.map((request) =>
                                        requestRow(request, 2),
                                      )}
                                  </ul>
                                </li>
                              );
                            })}
                          {open &&
                            collection.requests.map((request) =>
                              requestRow(request, 1),
                            )}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            )}
          </>
        )}
      </div>
      {footer}
      <SidebarDialogs action={action} onClose={() => setAction(null)} />
    </aside>
  );
}
