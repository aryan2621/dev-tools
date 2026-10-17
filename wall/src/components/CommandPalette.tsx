import { useMemo, useState } from 'react';
import { History, Sparkles, Plus, Sun, Cpu, CircleAlert, Search, MessageSquare, Columns2, Eraser, LayoutDashboard, Settings, Bookmark } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { cn } from '../lib/utils';



const ICONS = {
  ai: Sparkles,
  tab: Plus,
  theme: Sun,
  model: Cpu,
  explain: CircleAlert,
  history: History,
  chat: MessageSquare,
  split: Columns2,
  clear: Eraser,
  home: LayoutDashboard,
  settings: Settings,
  bookmark: Bookmark,
};

export type PaletteItem = {
  id: string;
  label: string;
  hint?: string;
  group: 'Actions' | 'Bookmarks' | 'History';
  icon: keyof typeof ICONS;
  run: () => void;
};

/** Warp-style command palette: one search box over app actions and the shell history of this session. */
export function CommandPalette({ items, onClose }: { items: PaletteItem[]; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => !q || i.label.toLowerCase().includes(q)).slice(0, 40);
  }, [items, query]);

  const pick = (item?: PaletteItem) => {
    if (!item) return;
    onClose();
    // Let the dialog release focus first, so inserted text lands in the terminal.
    setTimeout(item.run, 0);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, shown.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(shown[sel]);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="top-24 max-w-[560px] translate-y-0 gap-2 rounded-xl p-3"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSel(0);
            }}
            onKeyDown={onKey}
            placeholder="Search actions and command history…"
            className="pl-9 pr-8"
          />
        </div>
        <div className="max-h-[320px] overflow-y-auto">
          {shown.length === 0 && <p className="p-3 text-app-label text-muted-foreground">Nothing matches.</p>}
          {shown.map((item, i) => {
            const Icon = ICONS[item.icon];
            const header = i === 0 || shown[i - 1].group !== item.group;
            return (
              <div key={item.id}>
                {header && (
                  <div className="px-2 pb-1 pt-2 text-app-caption font-medium text-muted-foreground">{item.group}</div>
                )}
                <button
                  onMouseEnter={() => setSel(i)}
                  onClick={() => pick(item)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-app-label',
                    i === sel ? 'bg-accent text-accent-foreground' : 'text-foreground',
                  )}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className={cn('min-w-0 flex-1 truncate', item.group === 'History' && 'font-mono text-app-caption')}>
                    {item.label}
                  </span>
                  {item.hint && <span className="text-app-caption text-muted-foreground">{item.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
