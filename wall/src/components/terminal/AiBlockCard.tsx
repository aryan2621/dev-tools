import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { CornerDownLeft, Play, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';
import { AiBlock, Suggestion, recentCommands, useBlocks } from '../../stores/blocks';
import { insertIntoPrompt } from '../../lib/ptyRegistry';
import { partialField } from '../../lib/partialJson';
import { Button } from '../ui/button';
import { RiskBadge } from '../RiskBadge';
import { CommandText } from './CommandText';

/** A natural-language request typed in the editor, answered inline with a command suggestion. */
export function AiBlockCard({ paneId, block, onRun }: { paneId: number; block: AiBlock; onRun: (cmd: string) => void }) {
  const [raw, setRaw] = useState('');
  const [confirm, setConfirm] = useState(false);
  const started = useRef<string | null>(null);
  const patch = (p: Partial<AiBlock>) => useBlocks.getState().patchBlock<AiBlock>(paneId, block.id, p);

  useEffect(() => {
    if (block.status !== 'loading' || started.current === block.id + block.startedAt) return;
    started.current = block.id + block.startedAt;
    const id = crypto.randomUUID();
    setRaw('');
    const off = listen<{ requestId: string; kind: string; text: string }>('ai://event', (e) => {
      if (e.payload.requestId === id && e.payload.kind === 'token') setRaw((r) => r + e.payload.text);
    });
    invoke<Suggestion>('ai_suggest', { requestId: id, prompt: block.prompt, cwd: block.cwd || null, recent: recentCommands(paneId) })
      .then((result) => patch({ status: 'done', result }))
      .catch((e) => patch({ status: 'error', error: String(e) }))
      .finally(() => off.then((u) => u()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.status, block.startedAt]);

  const shown = block.result?.command ?? partialField(raw, 'command');
  const accept = (run: boolean) => {
    const r = block.result;
    if (!r) return;
    invoke('history_event', { kind: 'ai_accepted' }).catch(() => {});
    if (run) {
      if (r.risk !== 'safe' && !confirm) {
        setConfirm(true);
        return;
      }
      onRun(r.command);
    } else insertIntoPrompt(paneId, r.command);
  };

  return (
    <div className="mx-2 rounded-lg border border-brand/20 bg-brand/[0.035] px-4 py-2.5 animate-rise-in">
      <div className="flex items-center gap-2 text-app-label text-foreground">
        <Sparkles className="size-3.5 shrink-0 text-brand" />
        <span className="min-w-0 flex-1 truncate">{block.prompt}</span>
      </div>
      {block.status === 'loading' && !shown && (
        <p className="mt-1.5 pl-[22px] text-app-caption text-muted-foreground animate-pulse">Thinking… (the first request loads the model)</p>
      )}
      {block.status === 'error' && <p className="mt-1.5 pl-[22px] text-app-caption text-destructive">{block.error}</p>}
      {shown && (
        <div className="mt-2 pl-[22px]">
          <div className="rounded-md border border-border bg-background px-3 py-2 font-mono text-[0.95em]">
            <span className="select-none text-muted-foreground">$ </span>
            <CommandText text={shown} />
          </div>
          {block.result && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <RiskBadge risk={block.result.risk} />
              <span className="min-w-0 flex-1 text-app-caption text-muted-foreground">{block.result.explanation}</span>
              <Button size="sm" variant="ghost" onClick={() => patch({ status: 'loading', startedAt: Date.now(), result: undefined })}>
                <RefreshCw /> Retry
              </Button>
              <Button size="sm" variant="outline" onClick={() => accept(false)}>
                <CornerDownLeft /> Edit
              </Button>
              <Button size="sm" variant={confirm ? 'destructive' : 'default'} onClick={() => accept(true)}>
                {confirm ? <TriangleAlert /> : <Play />}
                {confirm ? `Run (${block.result.risk})` : 'Run'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
