import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Bot, Command, Folder, MessageSquare, Search, Sparkles } from 'lucide-react';
import { getPane } from '../../lib/ptyRegistry';
import { shortPath } from '../../lib/format';
import { useSettings } from '../../stores/settings';

const TIPS = [
  { icon: Sparkles, keys: 'Type English', text: 'Plain questions go to AI automatically' },
  { icon: Bot, keys: '⌘I', text: 'Switch the input to Agent mode' },
  { icon: Command, keys: '⌘K', text: 'Ask AI for a command' },
  { icon: MessageSquare, keys: '⌘L', text: 'Chat about your blocks' },
  { icon: Search, keys: '⌘P', text: 'Command palette and history' },
];

/** Shown in a fresh pane: tips plus a few recent directories to jump to. */
export function EmptyState({ paneId }: { paneId: number }) {
  const [dirs, setDirs] = useState<string[]>([]);
  const show = useSettings((s) => s.showWelcome);
  const set = useSettings((s) => s.set);
  const ref = useRef<HTMLDivElement>(null);
  const [small, setSmall] = useState(false);

  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => setSmall(el.clientHeight < 380 || el.clientWidth < 420));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    invoke<{ cwd: string }[]>('history_search', { query: '', failedOnly: false, limit: 200 })
      .then((rows) => {
        const seen: string[] = [];
        for (const r of rows) if (r.cwd && !seen.includes(r.cwd)) seen.push(r.cwd);
        setDirs(seen.slice(0, 4));
      })
      .catch(() => {});
  }, []);

  if (!show) return <div ref={ref} className="h-full" />;

  if (small) {
    return (
      <div ref={ref} className="flex h-full items-center justify-center px-4 text-center text-app-caption text-muted-foreground">
        Type a command, or describe what you want in plain English.
      </div>
    );
  }

  return (
    <div ref={ref} className="flex h-full flex-col items-center justify-center gap-6 px-6 animate-rise-in">
      <div className="text-center">
        <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-foreground text-background shadow-md">
          <span className="font-mono text-lg font-semibold">W</span>
        </div>
        <h2 className="text-app-title text-foreground">Wall</h2>
        <p className="text-app-label text-muted-foreground">An AI terminal that runs on your Mac.</p>
      </div>
      <div className="grid w-full max-w-md gap-1">
        {TIPS.map((t) => (
          <div key={t.keys} className="flex items-center gap-3 rounded-lg px-3 py-1.5 text-app-label">
            <t.icon className="size-4 text-muted-foreground" />
            <span className="flex-1 text-foreground/80">{t.text}</span>
            <kbd className="rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-app-caption text-muted-foreground">
              {t.keys}
            </kbd>
          </div>
        ))}
      </div>
      {dirs.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {dirs.map((d) => (
            <button
              key={d}
              onClick={() => getPane(paneId)?.run(`cd ${JSON.stringify(d)}`)}
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-app-caption text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Folder className="size-3" /> {shortPath(d)}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => set('showWelcome', false)}
        className="text-app-caption text-muted-foreground/70 underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        Don’t show this again
      </button>
    </div>
  );
}
