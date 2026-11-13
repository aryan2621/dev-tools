import { save } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../api";
import type { EngineMeta, Profile, QueryResult, QueryTab } from "../types";
import type { QueryDraft } from "../lib/templates";

export type ExportFormat = "csv" | "json";

const errorText = (error: unknown) => (typeof error === "string" ? error : error instanceof Error ? error.message : String(error));

export function useWorkbench() {
  const [engines, setEngines] = useState<EngineMeta[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [connecting, setConnecting] = useState<Set<string>>(new Set());
  const [tabs, setTabs] = useState<QueryTab[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
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
      })
      .catch((error) => toast.error("Could not load workspace", { description: errorText(error) }))
      .finally(() => setLoading(false));
  }, []);

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
      };
      setTabs((current) => [...current, tab]);
      setActiveTabs((current) => ({ ...current, [profileId]: tab.id }));
      setActiveProfileId(profileId);
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
        setConnecting((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    },
    [newTab, tabs, profileName],
  );

  const disconnect = useCallback(
    async (id: string) => {
      await api("disconnect", { id });
      setConnected((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      toast(`Disconnected from ${profileName(id)}`);
    },
    [profileName],
  );

  const saveProfile = useCallback(async (profile: Profile) => {
    const saved = await api<Profile>("profile_save", { profile });
    setProfiles((current) => (current.some((p) => p.id === saved.id) ? current.map((p) => (p.id === saved.id ? saved : p)) : [...current, saved]));
    setActiveProfileId(saved.id);
    return saved;
  }, []);

  const deleteProfile = useCallback(
    async (id: string) => {
      await api("profile_delete", { id });
      setProfiles((current) => current.filter((profile) => profile.id !== id));
      setTabs((current) => current.filter((tab) => tab.profileId !== id));
      setConnected((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      if (activeProfileId === id) setActiveProfileId(profiles.find((profile) => profile.id !== id)?.id ?? null);
    },
    [activeProfileId, profiles],
  );

  const run = useCallback(
    async (tab: QueryTab, selection: string) => {
      const input = selection.trim() ? selection : tab.input;
      if (!input.trim() || tab.runId) return;
      const runId = crypto.randomUUID();
      patchTab(tab.id, { runId, error: null });
      try {
        const result = await api<QueryResult>("run_query", { id: tab.profileId, runId, input, operation: tab.operation });
        patchTab(tab.id, { result, runId: null });
      } catch (error) {
        patchTab(tab.id, { error: errorText(error), result: null, runId: null });
      }
    },
    [patchTab],
  );

  const cancel = useCallback((tab: QueryTab) => tab.runId && api("cancel_run", { runId: tab.runId }), []);

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
    exportResult,
  };
}

export type Workbench = ReturnType<typeof useWorkbench>;
