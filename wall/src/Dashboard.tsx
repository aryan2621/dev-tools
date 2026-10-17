import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { History as HistoryIcon, Home as HomeIcon, Settings as SettingsIcon, SquareTerminal } from 'lucide-react';
import { initLlmEvents, useLlm } from './stores/llm';
import { useApplySettings, loadSettings, syncSettings } from './stores/settings';
import { TooltipProvider } from './components/ui/tooltip';
import { Toaster } from './components/ui/sonner';
import { AppIcon, Kbd } from './components/bits';
import { Home } from './pages/Home';
import { History } from './pages/History';
import { SettingsDialog, SECTIONS, Section } from './pages/Settings';
import { cn } from './lib/utils';

type Page = 'home' | 'history';
const PAGES: { id: Page; label: string; icon: typeof HomeIcon }[] = [
  { id: 'home', label: 'Home', icon: HomeIcon },
  { id: 'history', label: 'History', icon: HistoryIcon },
];

const isSection = (s: string): s is Section => SECTIONS.some((x) => x.id === s);

/** The dashboard window (Murmur's main window, for Wall): a translucent sidebar, Home and History,
 * and Settings as a dialog. Opened from the terminal's app icon; the terminal stays terminal-only. */
export function Dashboard() {
  useApplySettings();
  const [page, setPage] = useState<Page>('home');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [section, setSection] = useState<Section>('appearance');
  const catalog = useLlm((s) => s.catalog);
  const pagesRef = useRef(PAGES);

  /** "home", "history" or "settings[/section]". */
  const go = (view: string) => {
    const [p, s] = view.split('/');
    if (p === 'settings') {
      if (s && isSection(s)) setSection(s);
      setSettingsOpen(true);
    } else {
      setPage(p === 'history' ? 'history' : 'home');
    }
  };

  useEffect(() => {
    go(location.hash.slice(1) || 'home');
    void loadSettings();
    const offs = [initLlmEvents(), syncSettings(), listen<string>('navigate', (e) => go(e.payload))];
    // ⌘1 / ⌘2 switch pages and ⌘, opens Settings, like Murmur.
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey) return;
      if (e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= pagesRef.current.length) {
        e.preventDefault();
        setPage(pagesRef.current[n - 1].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      offs.forEach((off) => off.then((u) => u()));
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0 });
  }, [page]);

  const ready = !!catalog?.running;
  const status = !catalog ? 'Starting…' : catalog.running ? 'AI ready' : catalog.active ? 'AI loads on first use' : 'No AI model yet';
  const tone = ready
    ? 'bg-emerald-500 shadow-[0_0_0_3px] shadow-emerald-500/20'
    : catalog?.active
      ? 'bg-amber-500 shadow-[0_0_0_3px] shadow-amber-500/20'
      : 'bg-muted-foreground/50';

  const navItem = (active: boolean) =>
    cn(
      'group flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors duration-150',
      active
        ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
        : 'text-sidebar-foreground/75 hover:bg-black/[0.04] hover:text-sidebar-foreground dark:hover:bg-white/[0.05]',
    );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="grid h-screen grid-cols-[232px_1fr] overflow-hidden">
        {/* Transparent: the window's native sidebar vibrancy shows through. */}
        <aside className="flex flex-col border-r border-sidebar-border px-3 pb-3">
          <div data-tauri-drag-region className="h-11 shrink-0" />
          <div data-tauri-drag-region className="flex items-center gap-3 px-2 pb-7 pt-1">
            <AppIcon className="size-9 shadow-md shadow-brand/25" />
            <div className="font-display text-[26px] font-medium leading-none tracking-tight">Wall</div>
          </div>

          <nav className="flex flex-col gap-0.5">
            {PAGES.map(({ id, label, icon: Icon }, i) => (
              <button key={id} onClick={() => setPage(id)} className={navItem(page === id)}>
                <Icon className="size-[17px]" strokeWidth={page === id ? 2.25 : 1.75} />
                <span className="flex-1 text-left">{label}</span>
                <span className="text-[11px] text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/80">⌘{i + 1}</span>
              </button>
            ))}
            <button onClick={() => invoke('focus_terminal').catch(() => {})} className={navItem(false)}>
              <SquareTerminal className="size-[17px]" strokeWidth={1.75} />
              <span className="flex-1 text-left">Terminal</span>
            </button>
          </nav>

          <button onClick={() => setSettingsOpen(true)} className={cn(navItem(false), 'mb-2 mt-auto')}>
            <SettingsIcon className="size-[17px]" strokeWidth={1.75} />
            <span className="flex-1 text-left">Settings</span>
            <span className="text-[11px] text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/80">⌘,</span>
          </button>

          <div className="rounded-xl border border-sidebar-border bg-card/70 p-3 shadow-hairline backdrop-blur">
            <button
              onClick={() => {
                setSection('ai');
                setSettingsOpen(true);
              }}
              className="flex w-full items-start gap-2.5 text-left"
            >
              <span className={cn('mt-[5px] size-2 shrink-0 rounded-full', tone)} />
              <span className="text-xs font-medium leading-snug text-foreground/85">
                {status}
                {catalog?.running && <span className="block font-normal text-muted-foreground">{catalog.running}</span>}
              </span>
            </button>
            <div className="mt-2.5 grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1.5 border-t border-sidebar-border pt-2.5 text-[11px] text-muted-foreground">
              <span className="flex"><Kbd>⌘K</Kbd></span> <span>ask AI for a command</span>
              <span className="flex"><Kbd>⌘L</Kbd></span> <span>AI chat</span>
              <span className="flex"><Kbd>⌘P</Kbd></span> <span>command palette</span>
              <span className="flex"><Kbd>⌘D</Kbd></span> <span>split pane</span>
            </div>
          </div>
        </aside>

        <main className="overflow-y-auto bg-background">
          <div data-tauri-drag-region className="sticky top-0 z-10 h-10 bg-gradient-to-b from-background via-background/80 to-transparent" />
          <div className="mx-auto max-w-[880px] px-10 pb-16" key={page}>
            <div className="animate-rise-in">
              {page === 'home' && <Home goTo={setPage} />}
              {page === 'history' && <History />}
            </div>
          </div>
        </main>
      </div>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} section={section} onSection={setSection} />
      <Toaster />
    </TooltipProvider>
  );
}
