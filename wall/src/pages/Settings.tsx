import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Bot, Info, Keyboard, Palette, RotateCcw, SquareTerminal } from 'lucide-react';
import { useSettings, ACCENTS, FONTS, Settings as S, Accent } from '../stores/settings';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';
import { Panel } from '../components/bits';
import { Switch } from '../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Button } from '../components/ui/button';
import { ModelList } from '../components/ModelPicker';
import { cn } from '../lib/utils';

export const SECTIONS = [
  { id: 'appearance', label: 'Appearance', icon: Palette, description: 'Theme, accent and the terminal text.' },
  { id: 'terminal', label: 'Terminal', icon: SquareTerminal, description: 'How blocks, the cursor and scrollback behave.' },
  { id: 'ai', label: 'AI', icon: Bot, description: 'Local models through the bundled llama.cpp server. Nothing leaves this Mac.' },
  { id: 'keys', label: 'Keyboard', icon: Keyboard, description: 'Every shortcut in the terminal.' },
  { id: 'about', label: 'About', icon: Info, description: 'Version, data and resets.' },
] as const;

export type Section = (typeof SECTIONS)[number]['id'];

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-16 items-center gap-6 border-b px-5 py-3.5 last:border-0">
      <div className="min-w-[160px] flex-1">
        <div className="text-[13px] font-medium text-foreground">{label}</div>
        {hint && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex min-w-0 max-w-[60%] flex-none justify-end">{children}</div>
    </div>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      {title && <h3 className="mb-2 px-1 text-[13px] font-semibold tracking-tight">{title}</h3>}
      <Panel className="overflow-hidden">{children}</Panel>
    </section>
  );
}

function Toggle<K extends keyof S>({ k }: { k: K }) {
  const value = useSettings((s) => s[k]) as boolean;
  const set = useSettings((s) => s.set);
  return <Switch checked={value} onCheckedChange={(v) => set(k, v as S[K])} />;
}

function Choice<K extends keyof S>({ k, options, width = 'w-40' }: { k: K; options: { value: string; label: string }[]; width?: string }) {
  const value = useSettings((s) => s[k]);
  const set = useSettings((s) => s.set);
  return (
    <Select value={String(value)} onValueChange={(v) => set(k, (typeof value === 'number' ? Number(v) : v) as S[K])}>
      <SelectTrigger className={width}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Range<K extends keyof S>({ k, min, max, step, format }: { k: K; min: number; max: number; step: number; format?: (v: number) => string }) {
  const value = useSettings((s) => s[k]) as number;
  const set = useSettings((s) => s.set);
  return (
    <div className="flex w-56 items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => set(k, Number(e.target.value) as S[K])}
        className="h-1 flex-1 cursor-pointer accent-[hsl(var(--brand))]"
      />
      <span className="w-12 text-right tabular-nums text-app-caption text-muted-foreground">{format ? format(value) : value}</span>
    </div>
  );
}

const KEYS: [string, string][] = [
  ['⌘T', 'New tab'],
  ['⌘W', 'Close pane / tab'],
  ['⌘⇧W', 'Close all other panes'],
  ['⌘1 … ⌘9', 'Switch tab'],
  ['⌘D / ⌘⇧D', 'Split right / down'],
  ['⌘⌥ ← → ↑ ↓', 'Move between panes'],
  ['⌘K', 'Ask AI for a command'],
  ['⌘I', 'Cycle input mode: Shell → AI → Agent'],
  ['#  …', 'Start a line with # to ask AI'],
  ['⌘L', 'AI chat panel'],
  ['⌘E', 'Explain the last failed command'],
  ['⌘P', 'Command palette'],
  ['⌘F', 'Find in blocks'],
  ['⌘↑ / ⌘↓', 'Select previous / next block'],
  ['→  or  End', 'Accept the ghost suggestion'],
  ['⌥→', 'Accept one word of the suggestion'],
  ['Tab', 'Complete commands and paths'],
  ['↑ / ↓', 'History (prefix search)'],
  ['⇧⏎', 'New line in the editor'],
  ['⌘,', 'Settings'],
  ['⌘⇧H', 'Open Wall (Home and History)'],
];

/** Settings, as a dialog over the dashboard (as in Murmur): sections on the left, the chosen one on the right. */
export function SettingsDialog({ open, onOpenChange, section, onSection }: { open: boolean; onOpenChange: (open: boolean) => void; section: Section; onSection: (s: Section) => void }) {
  const active = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const accent = useSettings((s) => s.accent);
  const set = useSettings((s) => s.set);
  const reset = useSettings((s) => s.reset);
  const [paths, setPaths] = useState<{ dataDir: string; version: string } | null>(null);

  useEffect(() => {
    if (open && !paths) invoke<{ dataDir: string; version: string }>('app_paths').then(setPaths).catch(() => {});
  }, [open, paths]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(640px,calc(100vh-4rem))] w-[min(880px,calc(100vw-3rem))] max-w-none gap-0 overflow-hidden bg-background p-0">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-sidebar">
        <div className="px-5 pb-3 pt-5">
          <DialogTitle className="font-display text-xl font-medium">Settings</DialogTitle>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 pb-4" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSection(s.id)}
              className={cn(
                'flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] transition-colors',
                s.id === active.id ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground',
              )}
            >
              <s.icon className="size-4 shrink-0 opacity-80" />
              {s.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="shrink-0 px-8 pb-4 pt-6">
          <h2 className="font-display text-2xl font-medium">{active.label}</h2>
          <DialogDescription className="mt-1 text-sm">{active.description}</DialogDescription>
        </header>
        <div key={active.id} className="flex-1 overflow-y-auto px-8 pb-8">
          {active.id === 'appearance' && (
            <>
              <Card title="Theme">
                <Row label="Color mode" hint="System follows macOS light and dark.">
                  <Choice k="theme" options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
                </Row>
                <Row label="Accent" hint="Used for the cursor, AI and highlights.">
                  <div className="flex gap-1.5">
                    {(Object.keys(ACCENTS) as Accent[]).map((a) => (
                      <button
                        key={a}
                        title={ACCENTS[a].label}
                        onClick={() => set('accent', a)}
                        className={cn('size-6 rounded-full ring-offset-2 ring-offset-card transition-all', accent === a && 'ring-2 ring-foreground/60')}
                        style={{ background: `hsl(${ACCENTS[a].light})` }}
                      />
                    ))}
                  </div>
                </Row>
                <Row label="Interface size">
                  <Choice k="uiSize" options={[{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Default' }, { value: 'lg', label: 'Large' }]} />
                </Row>
              </Card>
              <Card title="Terminal text">
                <Row label="Font">
                  <Choice k="fontFamily" width="w-52" options={FONTS.map((f) => ({ value: f, label: f.replace(' Variable', '') }))} />
                </Row>
                <Row label="Font size">
                  <Range k="fontSize" min={10} max={20} step={1} format={(v) => `${v}px`} />
                </Row>
                <Row label="Line height">
                  <Range k="lineHeight" min={1} max={1.8} step={0.05} format={(v) => v.toFixed(2)} />
                </Row>
              </Card>
              <Card title="Layout">
                <Row label="Compact blocks" hint="Hide the folder / time line above each command.">
                  <Toggle k="compactBlocks" />
                </Row>
                <Row label="Welcome screen" hint="Tips and recent folders shown in an empty pane.">
                  <Toggle k="showWelcome" />
                </Row>
                <Row label="Input position" hint="Where the command editor sits.">
                  <Choice k="inputPosition" options={[{ value: 'bottom', label: 'Bottom' }, { value: 'top', label: 'Top' }]} />
                </Row>
              </Card>
            </>
          )}

          {active.id === 'terminal' && (
            <>
              <Card title="Blocks">
                <Row label="Show timestamps" hint="When each command started.">
                  <Toggle k="showTimestamps" />
                </Row>
                <Row label="Show duration" hint="How long each command took.">
                  <Toggle k="showDuration" />
                </Row>
                <Row label="Lines before folding" hint="Longer output gets a “Show all” button.">
                  <Range k="maxOutputLines" min={10} max={200} step={5} />
                </Row>
              </Card>
              <Card title="Cursor">
                <Row label="Cursor style">
                  <Choice k="cursorStyle" options={[{ value: 'bar', label: 'Bar' }, { value: 'block', label: 'Block' }, { value: 'underline', label: 'Underline' }]} />
                </Row>
                <Row label="Blink">
                  <Toggle k="cursorBlink" />
                </Row>
              </Card>
              <Card title="Behavior">
                <Row label="Scrollback" hint="Lines kept for a running command.">
                  <Range k="scrollback" min={1000} max={50000} step={1000} format={(v) => `${v / 1000}k`} />
                </Row>
                <Row label="Copy on select">
                  <Toggle k="copyOnSelect" />
                </Row>
                <Row label="History suggestions" hint="Ghost text from your shell history; → accepts.">
                  <Toggle k="historySuggestions" />
                </Row>
              </Card>
            </>
          )}

          {active.id === 'ai' && (
            <>
              <Card title="Input">
                <Row label="Natural-language detection" hint="Plain English typed in the editor goes to AI instead of the shell.">
                  <Toggle k="nlDetection" />
                </Row>
                <Row label="AI autosuggestions" hint="Ask the model to complete a command after a short pause. Uses more CPU/GPU.">
                  <Toggle k="aiAutosuggest" />
                </Row>
              </Card>
              <Card title="Agent mode">
                <Row label="Max steps" hint="The agent stops after this many commands.">
                  <Range k="agentMaxSteps" min={2} max={20} step={1} />
                </Row>
                <Row label="Auto-run safe steps" hint="Read-only commands run without asking. Anything that changes files still waits for you.">
                  <Toggle k="agentAutoRunSafe" />
                </Row>
              </Card>
              <h3 className="mb-2 px-1 text-[13px] font-semibold tracking-tight">Models</h3>
              <ModelList />
            </>
          )}

          {active.id === 'keys' && (
            <>
              <Card>
                {KEYS.map(([k, v]) => (
                  <Row key={k} label={v}>
                    <kbd className="inline-flex h-[22px] items-center rounded-[6px] border border-b-2 border-border bg-card px-1.5 text-[11px] font-medium text-foreground/80">{k}</kbd>
                  </Row>
                ))}
              </Card>
            </>
          )}

          {active.id === 'about' && (
            <>
              <Card>
                <Row label="Version">
                  <span className="font-mono text-xs text-muted-foreground">{paths?.version ?? '…'}</span>
                </Row>
                <Row label="Data folder" hint="Settings, history.db, models and llama-server.log.">
                  <span title={paths?.dataDir} className="block min-w-0 truncate font-mono text-xs text-muted-foreground" data-selectable>
                    {paths?.dataDir}
                  </span>
                </Row>
                <Row label="Command history" hint="Clears the Home dashboard. Your shell's own history is untouched.">
                  <Button size="sm" variant="outline" onClick={() => invoke('history_clear').catch(() => {})}>
                    Clear
                  </Button>
                </Row>
                <Row label="Reset settings">
                  <Button size="sm" variant="outline" onClick={reset}>
                    <RotateCcw /> Reset
                  </Button>
                </Row>
              </Card>
            </>
          )}
        </div>
      </div>
      </DialogContent>
    </Dialog>
  );
}
