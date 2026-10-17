import { create } from 'zustand';

export type LayoutNode = { type: 'pane'; id: number } | { type: 'split'; dir: 'row' | 'col'; a: LayoutNode; b: LayoutNode };
export type Tab = { id: number; root: LayoutNode; focused: number };
export type Page = 'terminal' | 'home' | 'settings';
export type Rect = { id: number; x: number; y: number; w: number; h: number };

let nextId = 1;
const newPaneId = () => nextId++;

function newTabState(): Tab {
  const pane = newPaneId();
  return { id: newPaneId(), root: { type: 'pane', id: pane }, focused: pane };
}

export function paneIds(node: LayoutNode): number[] {
  return node.type === 'pane' ? [node.id] : [...paneIds(node.a), ...paneIds(node.b)];
}

/** Pane rectangles in percent of the tab area. Panes render flat, so splitting never remounts a shell. */
export function layoutRects(node: LayoutNode, x = 0, y = 0, w = 100, h = 100): Rect[] {
  if (node.type === 'pane') return [{ id: node.id, x, y, w, h }];
  if (node.dir === 'row') return [...layoutRects(node.a, x, y, w / 2, h), ...layoutRects(node.b, x + w / 2, y, w / 2, h)];
  return [...layoutRects(node.a, x, y, w, h / 2), ...layoutRects(node.b, x, y + h / 2, w, h / 2)];
}

function replace(node: LayoutNode, id: number, next: LayoutNode): LayoutNode {
  if (node.type === 'pane') return node.id === id ? next : node;
  return { ...node, a: replace(node.a, id, next), b: replace(node.b, id, next) };
}

function remove(node: LayoutNode, id: number): LayoutNode | null {
  if (node.type === 'pane') return node.id === id ? null : node;
  const a = remove(node.a, id);
  const b = remove(node.b, id);
  if (!a) return b;
  if (!b) return a;
  return { ...node, a, b };
}

type Store = {
  tabs: Tab[];
  activeTab: number;
  page: Page;
  settingsSection: string;
  setPage: (page: Page, section?: string) => void;
  newTab: () => void;
  closeTab: (id: number) => void;
  setActiveTab: (id: number) => void;
  focusPane: (pane: number) => void;
  split: (dir: 'row' | 'col') => void;
  closePane: (pane: number) => void;
  closeOtherPanes: () => void;
  focusDir: (dir: 'left' | 'right' | 'up' | 'down') => void;
};

const first = newTabState();

export const useWorkspace = create<Store>((set, get) => ({
  tabs: [first],
  activeTab: first.id,
  page: 'terminal',
  settingsSection: 'appearance',
  setPage: (page, section) => set((s) => ({ page, settingsSection: section ?? s.settingsSection })),
  newTab: () => {
    const t = newTabState();
    set((s) => ({ tabs: [...s.tabs, t], activeTab: t.id, page: 'terminal' }));
  },
  closeTab: (id) =>
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id);
      const rest = s.tabs.filter((t) => t.id !== id);
      if (!rest.length) {
        const t = newTabState();
        return { tabs: [t], activeTab: t.id };
      }
      const activeTab = s.activeTab === id ? rest[Math.min(idx, rest.length - 1)].id : s.activeTab;
      return { tabs: rest, activeTab };
    }),
  setActiveTab: (id) => set({ activeTab: id, page: 'terminal' }),
  focusPane: (pane) =>
    set((s) => ({ tabs: s.tabs.map((t) => (paneIds(t.root).includes(pane) ? { ...t, focused: pane } : t)) })),
  split: (dir) =>
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== s.activeTab) return t;
        const pane = newPaneId();
        return { ...t, root: replace(t.root, t.focused, { type: 'split', dir, a: { type: 'pane', id: t.focused }, b: { type: 'pane', id: pane } }), focused: pane };
      }),
    })),
  closePane: (pane) => {
    const tab = get().tabs.find((t) => paneIds(t.root).includes(pane));
    if (!tab) return;
    const root = remove(tab.root, pane);
    if (!root) return get().closeTab(tab.id);
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tab.id ? { ...t, root, focused: t.focused === pane ? paneIds(root)[0] : t.focused } : t)),
    }));
  },
  closeOtherPanes: () =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === s.activeTab ? { ...t, root: { type: 'pane', id: t.focused } } : t)),
    })),
  focusDir: (dir) => {
    const s = get();
    const tab = s.tabs.find((t) => t.id === s.activeTab);
    if (!tab) return;
    const rects = layoutRects(tab.root);
    const cur = rects.find((r) => r.id === tab.focused);
    if (!cur) return;
    const cx = cur.x + cur.w / 2;
    const cy = cur.y + cur.h / 2;
    const candidates = rects.filter((r) => {
      if (r.id === cur.id) return false;
      if (dir === 'left') return r.x + r.w <= cur.x + 0.1;
      if (dir === 'right') return r.x >= cur.x + cur.w - 0.1;
      if (dir === 'up') return r.y + r.h <= cur.y + 0.1;
      return r.y >= cur.y + cur.h - 0.1;
    });
    const best = candidates.sort(
      (a, b) => Math.hypot(a.x + a.w / 2 - cx, a.y + a.h / 2 - cy) - Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy),
    )[0];
    if (best) get().focusPane(best.id);
  },
}));

export function activePaneId(): number {
  const s = useWorkspace.getState();
  return s.tabs.find((t) => t.id === s.activeTab)?.focused ?? 0;
}
