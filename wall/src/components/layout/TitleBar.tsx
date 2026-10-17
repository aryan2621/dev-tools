import { BrickWall, Columns2, MessageSquare, Plus, Rows2, Search, X } from 'lucide-react';
import { openDashboard } from '../../lib/dashboard';
import { useWorkspace, paneIds } from '../../stores/workspace';
import { useBlocks } from '../../stores/blocks';
import { useChat } from '../../stores/chat';
import { Button } from '../ui/button';
import { Hint } from '../ui/tooltip';
import { cn } from '../../lib/utils';

function TabTitle({ pane }: { pane: number }) {
  const cwd = useBlocks((s) => s.byPane[pane]?.cwd);
  const running = useBlocks((s) => s.byPane[pane]?.running);
  const name = cwd ? cwd.replace(/\/+$/, '').split('/').pop() || '/' : 'zsh';
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {running && <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-brand" />}
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Overlay title bar: room for the traffic lights, tabs and actions. The app icon opens Wall's own window (Home, History, Settings). */
export function TitleBar({ onPalette }: { onPalette: () => void }) {
  const { tabs, activeTab, setActiveTab, closeTab, newTab, split } = useWorkspace();
  const chatOpen = useChat((s) => s.open);
  const toggleChat = useChat((s) => s.toggle);

  return (
    <div data-tauri-drag-region className="flex h-[42px] flex-none items-center gap-1 border-b border-border bg-sidebar pl-[84px] pr-2">
      <div data-tauri-drag-region className="flex min-w-0 flex-1 items-center gap-1">
          {tabs.map((t, i) => (
            <div
              key={t.id}
              onMouseDown={() => setActiveTab(t.id)}
              className={cn(
                'group flex h-7 min-w-0 max-w-[180px] cursor-default items-center gap-1.5 rounded-lg px-2.5 text-app-label transition-colors duration-fast',
                t.id === activeTab ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:bg-accent/60',
              )}
            >
              <TabTitle pane={t.focused} />
              {paneIds(t.root).length > 1 && <span className="text-app-caption text-muted-foreground">·{paneIds(t.root).length}</span>}
              <span className="hidden text-app-caption text-muted-foreground/60 group-hover:hidden lg:inline">{i < 9 ? `⌘${i + 1}` : ''}</span>
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => closeTab(t.id)}
                className="hidden rounded-sm text-muted-foreground hover:text-foreground group-hover:block"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          <Hint text="New tab (⌘T)">
            <Button variant="ghost" size="icon" className="size-7" onClick={newTab}>
              <Plus />
            </Button>
          </Hint>
      </div>

      <div className="flex items-center gap-0.5">
        <Hint text="Split right (⌘D)">
          <Button variant="ghost" size="icon" className="size-7" onClick={() => split('row')}>
            <Columns2 />
          </Button>
        </Hint>
        <Hint text="Split down (⌘⇧D)">
          <Button variant="ghost" size="icon" className="size-7" onClick={() => split('col')}>
            <Rows2 />
          </Button>
        </Hint>
        <Hint text="Command palette (⌘P)">
          <Button variant="ghost" size="icon" className="size-7" onClick={onPalette}>
            <Search />
          </Button>
        </Hint>
        <Hint text="AI chat (⌘L)">
          <Button variant="ghost" size="icon" className={cn('size-7', chatOpen && 'bg-accent text-brand')} onClick={toggleChat}>
            <MessageSquare />
          </Button>
        </Hint>
        <Hint text="Open Wall: Home, History and Settings (⌘⇧H)">
          <Button variant="ghost" size="icon" className="size-7" onClick={() => openDashboard('home')}>
            <BrickWall />
          </Button>
        </Hint>
      </div>
    </div>
  );
}
