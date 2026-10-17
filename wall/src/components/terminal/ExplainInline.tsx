import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { CornerDownLeft, Sparkles, X } from 'lucide-react';
import { ShellBlock, recentCommands } from '../../stores/blocks';
import { insertIntoPrompt } from '../../lib/ptyRegistry';
import { partialField } from '../../lib/partialJson';
import { Button } from '../ui/button';
import { RiskBadge, type Risk } from '../RiskBadge';

type Explanation = { explanation: string; command: string; risk: Risk };

/** Warp-style "explain this error" answer that unfolds under the failed block. */
export function ExplainInline({ paneId, block, onClose }: { paneId: number; block: ShellBlock; onClose: () => void }) {
  const [raw, setRaw] = useState('');
  const [result, setResult] = useState<Explanation | null>(null);
  const [error, setError] = useState('');
  const requestId = useRef(crypto.randomUUID());

  useEffect(() => {
    const id = requestId.current;
    const off = listen<{ requestId: string; kind: string; text: string }>('ai://event', (e) => {
      if (e.payload.requestId === id && e.payload.kind === 'token') setRaw((r) => r + e.payload.text);
    });
    invoke<Explanation>('ai_explain', {
      requestId: id,
      command: block.command,
      exitCode: block.exitCode ?? 1,
      output: block.output,
      cwd: block.cwd || null,
      recent: recentCommands(paneId, 4).slice(0, -1),
    })
      .then(setResult)
      .catch((e) => String(e) !== 'cancelled' && setError(String(e)));
    return () => {
      off.then((u) => u());
      invoke('ai_cancel', { requestId: id });
    };
  }, [block.id, block.command, block.exitCode, block.output, block.cwd, paneId]);

  const explanation = result?.explanation ?? partialField(raw, 'explanation');

  return (
    <div className="rounded-lg border border-brand/25 bg-brand/[0.04] p-3 text-app-label animate-rise-in">
      <div className="mb-1.5 flex items-center gap-2 text-app-caption font-medium text-brand">
        <Sparkles className="size-3.5" /> AI explanation
        <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </div>
      {error && <p className="text-destructive">{error}</p>}
      {!error && !explanation && <p className="animate-pulse text-muted-foreground">Thinking… (the first request loads the model)</p>}
      {explanation && <p className="leading-relaxed text-foreground/90">{explanation}</p>}
      {result && !result.command && (
        <p className="mt-2 text-app-caption text-muted-foreground">No single command fixes this; it needs a change by hand.</p>
      )}
      {result?.command && (
        <div className="mt-3 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-2 py-1 font-mono text-app-caption">
            {result.command}
          </code>
          <RiskBadge risk={result.risk} />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              insertIntoPrompt(paneId, result.command);
              invoke('history_event', { kind: 'ai_accepted' }).catch(() => {});
            }}
          >
            <CornerDownLeft /> Use fix
          </Button>
        </div>
      )}
    </div>
  );
}
