import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useBlocks, recentCommands } from '../stores/blocks';
import { focusTab, insertIntoPrompt } from '../lib/ptyRegistry';
import { partialField } from '../lib/partialJson';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { RiskBadge, type Risk } from './RiskBadge';
import { CornerDownLeft, Sparkles, TriangleAlert } from 'lucide-react';

type Suggestion = { command: string; explanation: string; risk: Risk };
type Phase = 'idle' | 'loading' | 'streaming' | 'done' | 'error';

export function AiBar({
  tabId,
  initialPrompt,
  onClose,
}: {
  tabId: number;
  /** Set by the inline `# ...` mode: ask immediately instead of waiting for Enter. */
  initialPrompt?: string;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState(initialPrompt ?? '');
  const [phase, setPhase] = useState<Phase>('idle');
  const [raw, setRaw] = useState('');
  const [result, setResult] = useState<Suggestion | null>(null);
  const [error, setError] = useState('');
  const [confirmDanger, setConfirmDanger] = useState(false);
  const requestId = useRef<string | null>(null);
  const lastPrompt = useRef('');
  const autoAsked = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    const off = listen<{ requestId: string; kind: string; text: string }>('ai://event', (e) => {
      if (e.payload.requestId !== requestId.current) return;
      if (e.payload.kind === 'token') {
        setPhase('streaming');
        setRaw((r) => r + e.payload.text);
      }
    });
    return () => {
      off.then((u) => u());
    };
  }, []);

  useEffect(() => {
    if (initialPrompt && !autoAsked.current) {
      autoAsked.current = true;
      lastPrompt.current = initialPrompt.trim();
      void ask();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    if (requestId.current && (phase === 'loading' || phase === 'streaming')) {
      invoke('ai_cancel', { requestId: requestId.current });
    }
    onClose();
    focusTab(tabId);
  };

  const ask = async () => {
    const text = prompt.trim();
    if (!text) return;
    const id = crypto.randomUUID();
    requestId.current = id;
    setPhase('loading');
    setRaw('');
    setResult(null);
    setError('');
    setConfirmDanger(false);
    const tab = useBlocks.getState().byPane[tabId];
    const recent = recentCommands(tabId);
    try {
      const s = await invoke<Suggestion>('ai_suggest', {
        requestId: id,
        prompt: text,
        cwd: tab?.cwd || null,
        recent,
      });
      if (requestId.current !== id) return;
      setResult(s);
      setPhase('done');
    } catch (e) {
      if (requestId.current !== id || String(e) === 'cancelled') return;
      setError(String(e));
      setPhase('error');
    }
  };

  const insert = async () => {
    if (!result) return;
    if (result.risk === 'danger' && !confirmDanger) {
      setConfirmDanger(true);
      return;
    }
    await insertIntoPrompt(tabId, result.command);
    invoke('history_event', { kind: 'ai_accepted' }).catch(() => {});
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Enter asks; once there is a suggestion and the text is unchanged, Enter inserts it.
      if (phase === 'done' && result && !e.shiftKey && prompt.trim() === lastPrompt.current) void insert();
      else {
        lastPrompt.current = prompt.trim();
        void ask();
      }
    }
  };

  const shown = result?.command ?? partialField(raw, 'command');

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent
        className="top-24 max-w-[640px] translate-y-0 gap-3 rounded-xl p-4"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          input.current?.focus();
        }}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          close();
        }}
      >
        <DialogTitle className="sr-only">Ask AI</DialogTitle>
        <div className="relative">
          <Sparkles className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand" />
          <Input
            ref={input}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={onKey}
            placeholder="Describe a command…  (Enter to ask, Esc to close)"
            className="pl-9 pr-8"
          />
        </div>
        {phase === 'loading' && (
          <p className="text-app-caption text-muted-foreground">Thinking… (the first request loads the model)</p>
        )}
        {phase === 'error' && (
          <p className="rounded-lg border border-destructive/20 bg-destructive/10 p-2 text-app-caption text-destructive">{error}</p>
        )}
        {shown && (
          <div className="space-y-2">
            <pre className="whitespace-pre-wrap break-all rounded-lg border border-border bg-card p-3 font-mono text-app-label text-foreground">
              $ {shown}
            </pre>
            {result && (
              <div className="flex items-center gap-3 text-app-caption">
                <RiskBadge risk={result.risk} />
                <span className="flex-1 text-muted-foreground">{result.explanation}</span>
                <Button size="sm" variant={confirmDanger ? 'destructive' : 'default'}
                  style={confirmDanger ? undefined : { color: 'hsl(var(--background))', background: 'hsl(var(--foreground))' }} onClick={insert}>
                  {confirmDanger ? 'Insert anyway' : 'Insert'}
                  {!confirmDanger && <CornerDownLeft />}
                </Button>
              </div>
            )}
            {result?.risk === 'danger' && (
              <p className="flex items-center gap-1.5 text-app-caption text-destructive">
                <TriangleAlert className="size-3.5 shrink-0" />
                This looks destructive. Inserting only types it at the prompt; you still press Enter to run it.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
