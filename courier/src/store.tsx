import { toast } from "sonner";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { commands } from "./commands";
import {
  insertRequest,
  locate,
  locateAll,
  mapRequest,
  moveRequest as relocateRequest,
  removeRequest,
  variablesFor,
} from "./tree";
import {
  type ApiResponse,
  type Collection,
  type Environment,
  type HistoryEntry,
  type KV,
  type SavedRequest,
  type Snapshot,
  newCollection,
  newFolder,
  newKV,
  newRequest,
} from "./types";

const SAVE_DELAY_MS = 350;

export type NodeKind = "collection" | "folder" | "request";

export interface Courier {
  ready: boolean;
  loadError: string | null;
  retryLoad: () => void;
  saveFailed: boolean;
  collections: Collection[];
  environments: Environment[];
  activeEnvironment: Environment | undefined;
  selected: SavedRequest | null;
  openRequests: SavedRequest[];
  saving: boolean;
  responses: Record<string, ApiResponse>;
  sending: Record<string, boolean>;
  variables: KV[];
  select: (id: string) => void;
  closeTab: (id: string) => void;
  updateRequest: (id: string, change: (request: SavedRequest) => SavedRequest) => void;
  addRequest: (collectionId: string, folderId?: string, template?: SavedRequest) => void;
  moveRequest: (id: string, collectionId: string, folderId: string | null) => void;
  addFolder: (collectionId: string) => void;
  addCollection: () => void;
  rename: (kind: NodeKind, id: string, name: string) => void;
  remove: (kind: NodeKind, id: string) => void;
  setCollectionVariables: (collectionId: string, variables: KV[]) => void;
  setEnvironments: (environments: Environment[]) => void;
  setActiveEnvironmentId: (id: string | null) => void;
  send: (id: string) => Promise<ApiResponse | null>;
  cancel: (id: string) => void;
  importRequest: (request: SavedRequest) => void;
  startRequest: () => void;
  openHistory: (entry: HistoryEntry) => void;
}

const CourierContext = createContext<Courier | null>(null);

export function useCourier() {
  const value = useContext(CourierContext);
  if (!value) throw new Error("CourierProvider missing");
  return value;
}

const withoutCaptureNoise = (captured: ApiResponse["captured"]) => captured.filter((entry) => entry.name !== "");

function mergeCaptures(environment: Environment, captured: ApiResponse["captured"]): Environment {
  const variables = [...environment.variables];
  for (const { name, value } of withoutCaptureNoise(captured)) {
    const index = variables.findIndex((variable) => variable.key === name);
    if (index >= 0) variables[index] = { ...variables[index], value };
    else variables.push(newKV(name, value));
  }
  return { ...environment, variables };
}

export function CourierProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [environments, setEnvironmentList] = useState<Environment[]>([]);
  const [activeEnvironmentId, setActiveEnvironmentId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, ApiResponse>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});

  const snapshot: Snapshot = { collections, environments, activeEnvironmentId };
  const latest = useRef(snapshot);
  latest.current = snapshot;

  const show = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) setOpenIds((current) => (current.includes(id) ? current : [...current, id]));
  }, []);

  const load = useCallback(() => {
    setLoadError(null);
    commands
      .loadState()
      .then((loaded) => {
        setCollections(loaded.collections);
        setEnvironmentList(loaded.environments);
        setActiveEnvironmentId(loaded.activeEnvironmentId);
        show(locateAll(loaded.collections)[0]?.request.id ?? null);
        setReady(true);
      })
      .catch((error) => setLoadError(String(error)));
  }, [show]);

  useEffect(load, [load]);

  useEffect(() => {
    if (!ready) return;
    setSaving(true);
    const timer = window.setTimeout(
      () =>
        commands
          .saveState(snapshot)
          .then(() => setSaveFailed(false))
          .catch((error) => {
            setSaveFailed(true);
            toast.error("Could not save changes", { description: String(error) });
          })
          .finally(() => setSaving(false)),
      SAVE_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [ready, collections, environments, activeEnvironmentId]);

  useEffect(() => {
    const flush = () => commands.saveState(latest.current);
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  const activeEnvironment = environments.find((environment) => environment.id === activeEnvironmentId);
  const located = useMemo(() => locate(collections, selectedId), [collections, selectedId]);
  const variables = useMemo(
    () => variablesFor(located?.collection, activeEnvironment),
    [located, activeEnvironment],
  );

  const updateRequest = useCallback(
    (id: string, change: (request: SavedRequest) => SavedRequest) =>
      setCollections((current) => mapRequest(current, id, change)),
    [],
  );

  const addRequest = useCallback((collectionId: string, folderId?: string, template?: SavedRequest) => {
    const request = template ?? newRequest();
    setCollections((current) => insertRequest(current, request, collectionId, folderId));
    show(request.id);
  }, [show]);

  const moveRequest = useCallback(
    (id: string, collectionId: string, folderId: string | null) =>
      setCollections((current) => relocateRequest(current, id, collectionId, folderId)),
    [],
  );

  const addFolder = useCallback((collectionId: string) => {
    setCollections((current) =>
      current.map((collection) =>
        collection.id === collectionId
          ? { ...collection, folders: [...collection.folders, newFolder()] }
          : collection,
      ),
    );
    toast.success("Folder added");
  }, []);

  const addCollection = useCallback(() => {
    // numbered so repeated clicks never produce identical names
    let n = collections.length + 1;
    while (collections.some((collection) => collection.name === `New Collection ${n}`)) n += 1;
    const name = `New Collection ${n}`;
    setCollections((current) => [...current, newCollection(name)]);
    toast.success(`Created "${name}"`, { description: "Right-click it in the sidebar to rename." });
  }, [collections]);

  const rename = useCallback((kind: NodeKind, id: string, name: string) => {
    if (kind === "request") return updateRequest(id, (request) => ({ ...request, name }));
    setCollections((current) =>
      current.map((collection) => {
        if (kind === "collection") return collection.id === id ? { ...collection, name } : collection;
        return {
          ...collection,
          folders: collection.folders.map((folder) => (folder.id === id ? { ...folder, name } : folder)),
        };
      }),
    );
  }, [updateRequest]);

  const remove = useCallback((kind: NodeKind, id: string) => {
    setCollections((current) => {
      if (kind === "request") return removeRequest(current, id);
      if (kind === "collection") return current.filter((collection) => collection.id !== id);
      return current.map((collection) => ({
        ...collection,
        folders: collection.folders.filter((folder) => folder.id !== id),
      }));
    });
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      const index = openIds.indexOf(id);
      const remaining = openIds.filter((openId) => openId !== id);
      setOpenIds(remaining);
      if (id === selectedId) setSelectedId(remaining[Math.min(index, remaining.length - 1)] ?? null);
    },
    [openIds, selectedId],
  );

  useEffect(() => {
    if (!ready) return;
    const alive = openIds.filter((id) => locate(collections, id));
    if (alive.length !== openIds.length) setOpenIds(alive);
    if (selectedId && !locate(collections, selectedId)) show(alive[0] ?? locateAll(collections)[0]?.request.id ?? null);
  }, [ready, collections, selectedId, openIds, show]);

  const setCollectionVariables = useCallback(
    (collectionId: string, next: KV[]) =>
      setCollections((current) =>
        current.map((collection) =>
          collection.id === collectionId ? { ...collection, variables: next } : collection,
        ),
      ),
    [],
  );

  const setEnvironments = useCallback((next: Environment[]) => {
    setEnvironmentList(next);
    setActiveEnvironmentId((current) =>
      next.some((environment) => environment.id === current) ? current : (next[0]?.id ?? null),
    );
  }, []);

  const send = useCallback(async (id: string) => {
    const { collections: current, environments: envs, activeEnvironmentId: activeId } = latest.current;
    const entry = locate(current, id);
    if (!entry) return null;
    const environment = envs.find((item) => item.id === activeId);
    setSending((state) => ({ ...state, [id]: true }));
    try {
      const response = await commands.sendRequest(entry.request, variablesFor(entry.collection, environment));
      if (!response) return null;
      setResponses((state) => ({ ...state, [id]: response }));
      if (environment && response.captured.length > 0) {
        setEnvironmentList((list) =>
          list.map((item) => (item.id === environment.id ? mergeCaptures(item, response.captured) : item)),
        );
      }
      return response;
    } finally {
      setSending((state) => ({ ...state, [id]: false }));
    }
  }, []);

  const cancel = useCallback((id: string) => void commands.cancelRequest(id), []);

  const importRequest = useCallback(
    (request: SavedRequest) => {
      const target = located?.collection ?? latest.current.collections[0];
      if (target) return addRequest(target.id, located?.collection === target ? located.folder?.id : undefined, request);
      const created = newCollection();
      setCollections([{ ...created, requests: [request] }]);
      show(request.id);
    },
    [addRequest, show, located],
  );

  const openHistory = useCallback(
    (entry: HistoryEntry) => importRequest({ ...entry.request, id: crypto.randomUUID() }),
    [importRequest],
  );

  const startRequest = useCallback(() => importRequest(newRequest()), [importRequest]);

  const value: Courier = {
    ready,
    loadError,
    retryLoad: load,
    saveFailed,
    collections,
    environments,
    activeEnvironment,
    selected: located?.request ?? null,
    openRequests: openIds.flatMap((id) => locate(collections, id)?.request ?? []),
    saving,
    responses,
    sending,
    variables,
    select: show,
    closeTab,
    updateRequest,
    addRequest,
    moveRequest,
    addFolder,
    addCollection,
    rename,
    remove,
    setCollectionVariables,
    setEnvironments,
    setActiveEnvironmentId,
    send,
    cancel,
    importRequest,
    startRequest,
    openHistory,
  };

  return <CourierContext.Provider value={value}>{children}</CourierContext.Provider>;
}
