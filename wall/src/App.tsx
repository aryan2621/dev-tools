import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { initLlmEvents } from './stores/llm';
import { useApplySettings, useSettings, loadSettings, syncSettings, ThemeMode } from './stores/settings';
import { useWorkspace, activePaneId, paneIds } from './stores/workspace';
import { useBlocks, lastFailed, shellBlocks, ShellBlock } from './stores/blocks';
import { useChat } from './stores/chat';
import { getPane } from './lib/ptyRegistry';
import { loadShellData } from './lib/shellData';
import { TooltipProvider } from './components/ui/tooltip';
import { TitleBar } from './components/layout/TitleBar';
import { TerminalPage } from './pages/TerminalPage';
import { openDashboard } from './lib/dashboard';
import { AiBar } from './components/AiBar';
import { CommandPalette, PaletteItem } from './components/CommandPalette';
import { Toaster } from './components/ui/sonner';

export function App() {
  useApplySettings();
  const activeTab = useWorkspace((s) => s.activeTab);
  const [aiOpen, setAiOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    void loadSettings();
    loadShellData();
    // Home in the dashboard window sends commands here to insert.
    const insert = listen<string>('insert-command', (e) => getPane(activePaneId())?.insert(e.payload));
    const offs = [initLlmEvents(), syncSettings(), insert];
    return () => offs.forEach((off) => off.then((u) => u()));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey) return;
      const ws = useWorkspace.getState();
      const k = e.key.toLowerCase();
      const hit = (fn: () => void) => {
        e.preventDefault();
        fn();
      };
      if (e.altKey && e.key.startsWith('Arrow')) {
        return hit(() => ws.focusDir(e.key.slice(5).toLowerCase() as 'left' | 'right' | 'up' | 'down'));
      }
      if (k === 't' && !e.shiftKey) return hit(ws.newTab);
      if (k === 'w' && e.shiftKey) return hit(ws.closeOtherPanes);
      if (k === 'w') {
        return hit(() => {
          const pane = activePaneId();
          const running = useBlocks.getState().byPane[pane]?.running;
          if (running && useSettings.getState().confirmCloseRunning && !window.confirm('A command is still running here. Close it?')) return;
          ws.closePane(pane);
        });
      }
      if (k === 'd') return hit(() => ws.split(e.shiftKey ? 'col' : 'row'));
      if (k === 'k') return hit(() => setAiOpen((o) => !o));
      if (k === 'p') return hit(() => setPaletteOpen((o) => !o));
      if (k === 'l') return hit(() => useChat.getState().toggle());
      if (k === ',') return hit(() => openDashboard('settings'));
      if (k === 'h' && e.shiftKey) return hit(() => openDashboard('home'));
      if (k === 'e') {
        const pane = activePaneId();
        const failed = lastFailed(pane);
        if (failed) hit(() => useBlocks.getState().patchBlock<ShellBlock>(pane, failed.id, { explainOpen: true }));
        return;
      }
      if (/^[1-9]$/.test(e.key)) {
        const tab = ws.tabs[Number(e.key) - 1];
        if (tab) hit(() => ws.setActiveTab(tab.id));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const paletteItems = (): PaletteItem[] => {
    const ws = useWorkspace.getState();
    const st = useSettings.getState();
    const pane = activePaneId();
    const failed = lastFailed(pane);
    const themes: ThemeMode[] = ['light', 'dark', 'system'];
    const actions: PaletteItem[] = [
      { id: 'ai', label: 'Ask AI for a command', hint: '⌘K', group: 'Actions', icon: 'ai', run: () => setAiOpen(true) },
      { id: 'chat', label: 'Toggle AI chat', hint: '⌘L', group: 'Actions', icon: 'chat', run: () => useChat.getState().toggle() },
      { id: 'tab', label: 'New tab', hint: '⌘T', group: 'Actions', icon: 'tab', run: ws.newTab },
      { id: 'split-r', label: 'Split pane right', hint: '⌘D', group: 'Actions', icon: 'split', run: () => ws.split('row') },
      { id: 'split-d', label: 'Split pane down', hint: '⌘⇧D', group: 'Actions', icon: 'split', run: () => ws.split('col') },
      { id: 'close-others', label: 'Close other panes', hint: '⌘⇧W', group: 'Actions', icon: 'split', run: ws.closeOtherPanes },
      { id: 'clear', label: 'Clear blocks', group: 'Actions', icon: 'clear', run: () => useBlocks.getState().clear(pane) },
      { id: 'home', label: 'Open Home', hint: '⌘⇧H', group: 'Actions', icon: 'home', run: () => openDashboard('home') },
      { id: 'settings', label: 'Open Settings', hint: '⌘,', group: 'Actions', icon: 'settings', run: () => openDashboard('settings') },
      { id: 'models', label: 'AI models…', group: 'Actions', icon: 'model', run: () => openDashboard('settings/ai') },
      {
        id: 'theme',
        label: `Theme: switch to ${themes[(themes.indexOf(st.theme) + 1) % 3]}`,
        group: 'Actions',
        icon: 'theme',
        run: () => st.set('theme', themes[(themes.indexOf(st.theme) + 1) % 3]),
      },
      {
        id: 'nl',
        label: `${st.nlDetection ? 'Disable' : 'Enable'} natural-language detection`,
        group: 'Actions',
        icon: 'ai',
        run: () => st.set('nlDetection', !st.nlDetection),
      },
      {
        id: 'compact',
        label: `${st.compactBlocks ? 'Disable' : 'Enable'} compact blocks`,
        group: 'Actions',
        icon: 'settings',
        run: () => st.set('compactBlocks', !st.compactBlocks),
      },
    ];
    if (failed) {
      actions.unshift({
        id: 'explain',
        label: `Explain last failure (exit ${failed.exitCode})`,
        hint: '⌘E',
        group: 'Actions',
        icon: 'explain',
        run: () => useBlocks.getState().patchBlock<ShellBlock>(pane, failed.id, { explainOpen: true }),
      });
    }
    const blocks = shellBlocks(pane);
    const bookmarks: PaletteItem[] = blocks
      .filter((b) => b.bookmarked)
      .map((b) => ({
        id: `b-${b.id}`,
        label: b.command,
        group: 'Bookmarks',
        icon: 'bookmark',
        run: () => document.getElementById(`block-${b.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      }));
    const seen = new Set<string>();
    const history: PaletteItem[] = blocks
      .slice()
      .reverse()
      .filter((b) => b.command && !seen.has(b.command) && seen.add(b.command))
      .map((b) => ({
        id: `h-${b.id}`,
        label: b.command,
        hint: 'insert',
        group: 'History',
        icon: 'history',
        run: () => getPane(pane)?.insert(b.command),
      }));
    return [...actions, ...bookmarks, ...history];
  };

  const tabPanes = useWorkspace((s) => s.tabs.find((t) => t.id === s.activeTab));

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full flex-col bg-background">
        <TitleBar onPalette={() => setPaletteOpen(true)} />
        <div className="flex min-h-0 flex-1">
          <TerminalPage visible />
        </div>
        {paletteOpen && <CommandPalette items={paletteItems()} onClose={() => setPaletteOpen(false)} />}
        {aiOpen && tabPanes && (
          <AiBar
            key={`${activeTab}:${tabPanes.focused}:${paneIds(tabPanes.root).length}`}
            tabId={tabPanes.focused}
            onClose={() => setAiOpen(false)}
          />
        )}
        <Toaster />
      </div>
    </TooltipProvider>
  );
}
