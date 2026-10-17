import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export type ModelView = {
  id: string;
  name: string;
  sizeMb: number;
  minRamGb: number;
  note: string;
  installed: boolean;
};

export type DownloadProgress = {
  id: string;
  done: number;
  total: number;
  error: string | null;
  finished: boolean;
};

export type CatalogView = {
  ramGb: number;
  recommended: string;
  runtimeAvailable: boolean;
  running: string | null;
  download: DownloadProgress | null;
  active: string | null;
  models: ModelView[];
};

type LlmStore = {
  catalog: CatalogView | null;
  error: string | null;
  refresh: () => Promise<void>;
  download: (id: string) => Promise<void>;
  cancel: () => Promise<void>;
};

export const useLlm = create<LlmStore>((set, get) => ({
  catalog: null,
  error: null,
  refresh: async () => {
    try {
      set({ catalog: await invoke<CatalogView>('llm_catalog') });
    } catch (e) {
      set({ error: String(e) });
    }
  },
  download: async (id) => {
    set({ error: null });
    try {
      await invoke('llm_download', { modelId: id });
      await get().refresh();
    } catch (e) {
      set({ error: String(e) });
    }
  },
  cancel: async () => {
    await invoke('llm_cancel_download');
  },
}));

/** Subscribes the store to download progress. Call once at startup. */
export function initLlmEvents(): Promise<() => void> {
  useLlm.getState().refresh();
  return listen<DownloadProgress>('llm://download-progress', (e) => {
    const p = e.payload;
    useLlm.setState((s) => (s.catalog ? { catalog: { ...s.catalog, download: p } } : s));
    if (p.finished || p.error) useLlm.getState().refresh();
  });
}
