import { save } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../api";
import type { EngineMeta, Profile, QueryResult, QueryTab } from "../types";
import type { QueryDraft } from "../lib/templates";
import { attempt, errorText } from "../lib/notify";
import { without } from "../lib/utils";

export type ExportFormat = "csv" | "json";


const TABS_KEY = "querylab:tabs";
const ROW_LIMIT_KEY = "querylab:row-limit";
export const ROW_LIMITS = [100, 1000, 10000, 100000];
const DEFAULT_ROW_LIMIT = 100000;

type SavedTab = Pick<QueryTab, "id" | "profileId" | "title" | "input" | "operation">;

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

const restoreTab = (saved: SavedTab): QueryTab => ({ ...saved, result: null, error: null, runId: null });

export function useWorkbench() {
  const [engines, setEngines] = useState<EngineMeta[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [connecting, setConnecting] = useState<Set<string>>(new Set());
  const [tabs, setTabs] = useState<QueryTab[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [rowLimit, setRowLimit] = useState(() => readStored<number>(ROW_LIMIT_KEY, DEFAULT_ROW_LIMIT));
  const counter = useRef(0);

  const engineFor = useCallback(
    (profile: Profile | undefined) => engines.find((engine) => engine.kind === profile?.engine),
    [engines],
  );
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId);
  const activeEngine = engineFor(activeProfile);
  const profileTabs = useMemo(() => tabs.filter((tab) => tab.profileId === activeProfileId), [tabs, activeProfileId]);
  const activeTab = profileTabs.find((tab) => tab.id === activeTabs[activeProfileId ?? ""]) ?? profileTabs[0] ?? null;

  useEffect(() => {
    Promise.all([api<EngineMeta[]>("engines"), api<Profile[]>("profiles_list"), api<string[]>("connected_ids")])
      .then(([loadedEngines, loadedProfiles, ids]) => {
        setEngines(loadedEngines);
        setProfiles(loadedProfiles);
        setConnected(new Set(ids));
        setActiveProfileId(loadedProfiles[0]?.id ?? null);
        const known = new Set(loadedProfiles.map((profile) => profile.id));
        const restored = readStored<SavedTab[]>(TABS_KEY, []).filter((tab) => known.has(tab.profileId)).map(restoreTab);
        counter.current = restored.length;
        setTabs(restored);
      })
      .catch((error) => toast.error("Could not load workspace", { description: errorText(error) }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading) return;
    writeStored(
      TABS_KEY,
      tabs.map(({ id, profileId, title, input, operation }) => ({ id, profileId, title, input, operation })),
    );
  }, [tabs, loading]);

  useEffect(() => writeStored(ROW_LIMIT_KEY, rowLimit), [rowLimit]);

  const patchTab = useCallback((id: string, patch: Partial<QueryTab>) => {
    setTabs((current) => current.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)));
  }, []);

  const newTab = useCallback(
    (profileId: string, draft?: QueryDraft) => {
      const engine = engineFor(profiles.find((profile) => profile.id === profileId));
      counter.current += 1;
      const tab: QueryTab = {
        id: crypto.randomUUID(),
        profileId,
        title: `Query ${counter.current}`,
        input: draft?.input ?? "",
        operation: draft ? draft.operation : (engine?.defaultOperation ?? null),
        result: null,
        error: null,
        runId: null,
        table: draft?.table,
      };
      setTabs((current) => [...current, tab]);
      setActiveTabs((current) => ({ ...current, [profileId]: tab.id }));
      setActiveProfileId(profileId);
      return tab;
    },
    [engineFor, profiles],
  );

  const closeTab = useCallback(
    (id: string) => {
      const closing = tabs.find((tab) => tab.id === id);
      if (closing?.runId) api("cancel_run", { runId: closing.runId });
      setTabs((current) => current.filter((tab) => tab.id !== id));
    },
    [tabs],
  );

  const selectTab = useCallback(
    (id: string) => activeProfileId && setActiveTabs((current) => ({ ...current, [activeProfileId]: id })),
    [activeProfileId],
  );

  const profileName = useCallback((id: string) => profiles.find((profile) => profile.id === id)?.name ?? "connection", [profiles]);

  const connect = useCallback(
    async (id: string) => {
      setActiveProfileId(id);
      setConnecting((current) => new Set(current).add(id));
      try {
        await api("connect", { id });
        setConnected((current) => new Set(current).add(id));
        toast.success(`Connected to ${profileName(id)}`);
        if (!tabs.some((tab) => tab.profileId === id)) newTab(id);
      } catch (error) {
        toast.error(`Could not connect to ${profileName(id)}`, { description: errorText(error), action: { label: "Retry", onClick: () => connect(id) } });
      } finally {
        setConnecting((current) => without(current, id));
      }
    },
    [newTab, tabs, profileName],
  );

  const disconnect = useCallback(
    async (id: string) => {
      if ((await attempt(() => api("disconnect", { id }), undefined, "Could not disconnect")) === undefined) return;
      setConnected((current) => without(current, id));
      toast(`Disconnected from ${profileName(id)}`);
    },
    [profileName],
  );

  const saveProfile = useCallback(async (profile: Profile) => {
    const saved = await api<Profile>("profile_save", { profile });
    setProfiles((current) => (current.some((p) => p.id === saved.id) ? current.map((p) => (p.id === saved.id ? saved : p)) : [...current, saved]));
    setActiveProfileId(saved.id);
    if (connected.has(saved.id)) {
      await api("disconnect", { id: saved.id });
      await connect(saved.id);
    }
    return saved;
  }, [connected, connect]);

  const deleteProfile = useCallback(
    async (id: string) => {
      if ((await attempt(() => api("profile_delete", { id }), undefined, "Could not delete connection")) === undefined) return;
      setProfiles((current) => current.filter((profile) => profile.id !== id));
      setTabs((current) => current.filter((tab) => tab.profileId !== id));
      setConnected((current) => without(current, id));
      if (activeProfileId === id) setActiveProfileId(profiles.find((profile) => profile.id !== id)?.id ?? null);
    },
    [activeProfileId, profiles],
  );

  const run = useCallback(
    async (tab: QueryTab, selection: string) => {
      const input = selection.trim() ? selection : tab.input;
      if (!input.trim() || tab.runId) return {};
      const runId = crypto.randomUUID();
      patchTab(tab.id, { runId, error: null });
      try {
        const result = await api<QueryResult>("run_query", { id: tab.profileId, runId, input, operation: tab.operation, rowLimit });
        patchTab(tab.id, { result, runId: null });
        return { result };
      } catch (error) {
        patchTab(tab.id, { error: errorText(error), result: null, runId: null });
        return { error: errorText(error) };
      }
    },
    [patchTab, rowLimit],
  );

  const cancel = useCallback((tab: QueryTab) => tab.runId && attempt(() => api("cancel_run", { runId: tab.runId }), undefined, "Could not cancel query"), []);

  const exportResult = useCallback(async (result: QueryResult, format: ExportFormat) => {
    const path = await save({ defaultPath: `result.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
    if (!path) return;
    try {
      await api("export_result", { path, format, columns: result.columns, rows: result.rows });
      toast.success(`Exported ${result.rows.length.toLocaleString()} rows`, { description: path });
    } catch (error) {
      toast.error("Export failed", { description: errorText(error) });
    }
  }, []);

  return {
    engines,
    profiles,
    connected,
    connecting,
    tabs: profileTabs,
    activeProfile,
    activeEngine,
    activeTab,
    loading,
    engineFor,
    setActiveProfileId,
    newTab,
    closeTab,
    selectTab,
    patchTab,
    connect,
    disconnect,
    saveProfile,
    deleteProfile,
    run,
    cancel,
    rowLimit,
    setRowLimit,
    exportResult,
  };
}

