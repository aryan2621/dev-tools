import { layoutRects, paneIds, useWorkspace } from '../stores/workspace';
import { useChat } from '../stores/chat';
import { X } from 'lucide-react';
import { Pane } from '../components/terminal/Pane';
import { Hint } from '../components/ui/tooltip';
import { ChatPanel } from '../components/ai/ChatPanel';
import { cn } from '../lib/utils';

/** Every pane of every tab, rendered flat and positioned from the split tree so shells survive re-layout. */
export function TerminalPage({ visible }: { visible: boolean }) {
  const tabs = useWorkspace((s) => s.tabs);
  const activeTab = useWorkspace((s) => s.activeTab);
  const focusPane = useWorkspace((s) => s.focusPane);
  const closePane = useWorkspace((s) => s.closePane);
  const chatOpen = useChat((s) => s.open);

  return (
    <div className={cn('flex min-h-0 flex-1', !visible && 'hidden')}>
      <div className="relative min-w-0 flex-1">
        {tabs.map((tab) => {
          const rects = layoutRects(tab.root);
          const multi = paneIds(tab.root).length > 1;
          const tabVisible = visible && tab.id === activeTab;
          return rects.map((r) => (
            <div
              key={r.id}
              className={cn('absolute', multi && 'p-[1px]', !tabVisible && 'invisible')}
              style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }}
            >
              <div
                className={cn(
                  'group/pane relative h-full overflow-hidden',
                  multi && 'rounded-md border transition-colors duration-fast',
                  multi && (tab.focused === r.id ? 'border-brand/40' : 'border-border opacity-[0.92]'),
                )}
              >
                <Pane
                  paneId={r.id}
                  active={tab.focused === r.id}
                  visible={tabVisible}
                  onFocus={() => tab.focused !== r.id && focusPane(r.id)}
                  onExit={() => closePane(r.id)}
                />
                {multi && (
                  <Hint text="Close pane  ⌘W">
                    <button
                      onClick={() => closePane(r.id)}
                      className="absolute right-1.5 top-1.5 z-20 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/pane:opacity-100"
                    >
                      <X className="size-3.5" />
                    </button>
                  </Hint>
                )}
              </div>
            </div>
          ));
        })}
      </div>
      {chatOpen && <ChatPanel />}
    </div>
  );
}
