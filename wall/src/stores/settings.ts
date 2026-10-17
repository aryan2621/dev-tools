import { useEffect } from 'react';
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';

export type ThemeMode = 'light' | 'dark' | 'system';
export type Accent = 'terracotta' | 'blue' | 'green' | 'purple' | 'pink' | 'amber';

export type Settings = {
  // Appearance
  theme: ThemeMode;
  accent: Accent;
  uiSize: 'sm' | 'md' | 'lg';
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  compactBlocks: boolean;
  inputPosition: 'bottom' | 'top';
  showWelcome: boolean;
  // Terminal
  cursorStyle: 'block' | 'bar' | 'underline';
  cursorBlink: boolean;
  scrollback: number;
  copyOnSelect: boolean;
  confirmCloseRunning: boolean;
  showTimestamps: boolean;
  showDuration: boolean;
  maxOutputLines: number;
  // AI
  nlDetection: boolean;
  historySuggestions: boolean;
  aiAutosuggest: boolean;
  agentMaxSteps: number;
  agentAutoRunSafe: boolean;
  model: string | null;
};

export const DEFAULTS: Settings = {
  theme: 'system',
  accent: 'terracotta',
  uiSize: 'md',
  fontFamily: 'JetBrains Mono Variable',
  fontSize: 13,
  lineHeight: 1.35,
  compactBlocks: false,
  inputPosition: 'bottom',
  showWelcome: true,
  cursorStyle: 'bar',
  cursorBlink: true,
  scrollback: 10000,
  copyOnSelect: false,
  confirmCloseRunning: true,
  showTimestamps: true,
  showDuration: true,
  maxOutputLines: 40,
  nlDetection: true,
  historySuggestions: true,
  aiAutosuggest: false,
  agentMaxSteps: 8,
  agentAutoRunSafe: false,
  model: null,
};

/** HSL triples for --brand / --ring, light then dark. Terracotta is Claude's clay. */
export const ACCENTS: Record<Accent, { label: string; light: string; dark: string }> = {
  terracotta: { label: 'Clay', light: '15 56% 52%', dark: '15 63% 60%' },
  blue: { label: 'Blue', light: '212 70% 48%', dark: '212 80% 64%' },
  green: { label: 'Green', light: '152 45% 36%', dark: '152 45% 54%' },
  purple: { label: 'Purple', light: '262 50% 54%', dark: '262 60% 70%' },
  pink: { label: 'Pink', light: '336 60% 52%', dark: '336 70% 68%' },
  amber: { label: 'Amber', light: '34 80% 44%', dark: '38 85% 60%' },
};

export const FONTS = ['JetBrains Mono Variable', 'SF Mono', 'Menlo', 'Monaco', 'Fira Code', 'Cascadia Code'];

type Store = Settings & {
  loaded: boolean;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
};

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function persist(s: Settings) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    invoke('settings_save', { settings: s }).catch(() => {});
  }, 300);
}

function pick(s: Store): Settings {
  const out = {} as Settings;
  for (const k of Object.keys(DEFAULTS) as (keyof Settings)[]) (out as Record<string, unknown>)[k] = s[k];
  return out;
}

export const useSettings = create<Store>((set, get) => ({
  ...DEFAULTS,
  loaded: false,
  set: (key, value) => {
    set({ [key]: value } as Partial<Store>);
    persist(pick(get()));
    void emit('settings-changed', pick(get()));
    if (key === 'model') invoke('ai_set_model', { modelId: value }).catch(() => {});
  },
  reset: () => {
    set({ ...DEFAULTS });
    persist(DEFAULTS);
    void emit('settings-changed', DEFAULTS);
  },
}));

export async function loadSettings() {
  try {
    const saved = await invoke<Partial<Settings> | null>('settings_load');
    const merged = { ...DEFAULTS, ...(saved ?? {}) };
    // Geist Mono is no longer bundled; move saved terminals onto the new default.
    if (merged.fontFamily === 'Geist Mono Variable') merged.fontFamily = DEFAULTS.fontFamily;
    useSettings.setState({ ...merged, loaded: true });
    if (merged.model) await invoke('ai_set_model', { modelId: merged.model });
  } catch {
    useSettings.setState({ loaded: true });
  }
}

/** Keeps this window's settings in step with changes made in the other window (terminal or dashboard). */
export function syncSettings(): Promise<() => void> {
  return listen<Settings>('settings-changed', (e) => useSettings.setState(e.payload));
}

export function isDark(theme: ThemeMode) {
  return theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

/** Applies theme, accent and UI size to <html>. Mount once. */
export function useApplySettings() {
  const theme = useSettings((s) => s.theme);
  const accent = useSettings((s) => s.accent);
  const uiSize = useSettings((s) => s.uiSize);

  useEffect(() => {
    const apply = () => {
      const dark = isDark(theme);
      const root = document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(dark ? 'dark' : 'light');
      const hsl = ACCENTS[accent][dark ? 'dark' : 'light'];
      root.style.setProperty('--brand', hsl);
      root.style.setProperty('--ring', hsl);
      root.style.setProperty('--chart-1', hsl);
    };
    apply();
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme, accent]);

  useEffect(() => {
    document.documentElement.dataset.fontSize = uiSize;
  }, [uiSize]);

  const fontFamily = useSettings((s) => s.fontFamily);
  const fontSize = useSettings((s) => s.fontSize);
  const lineHeight = useSettings((s) => s.lineHeight);
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--wall-mono', `"${fontFamily}", "JetBrains Mono Variable", Menlo, monospace`);
    root.setProperty('--wall-font-size', `${fontSize}px`);
    root.setProperty('--wall-line-height', String(lineHeight));
  }, [fontFamily, fontSize, lineHeight]);
}
