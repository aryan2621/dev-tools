import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Bot, Check, CircleStop, Loader2, Play, SkipForward, Pencil, X } from 'lucide-react';
import { AgentBlock, AgentStep, useBlocks } from '../../stores/blocks';
import { useSettings } from '../../stores/settings';
import { insertIntoPrompt } from '../../lib/ptyRegistry';
import { Button } from '../ui/button';
import { RiskBadge, type Risk } from '../RiskBadge';
import { CommandText } from './CommandText';
import { cn } from '../../lib/utils';

type StepReply = { thought: string; command: string; done: boolean; summary: string; risk: Risk };

/**
 * Agent mode: the model proposes one command at a time, the user approves (or skips) it, Wall runs it in
 * this pane and feeds the output back until the goal is met.
 */
export function AgentBlockCard({
  paneId,
  block,
  onRun,
}: {
  paneId: number;
  block: AgentBlock;
  onRun: (cmd: string) => Promise<unknown>;
}) {
  const maxSteps = useSettings((s) => s.agentMaxSteps);
  const autoRunSafe = useSettings((s) => s.agentAutoRunSafe);
  const [confirm, setConfirm] = useState(false);
  const requestId = useRef<string | null>(null);
  const live = useRef(block);
  live.current = block;

  const patch = (p: Partial<AgentBlock>) => useBlocks.getState().patchBlock<AgentBlock>(paneId, block.id, p);
  const current = () =>
    (useBlocks.getState().byPane[paneId]?.blocks.find((b) => b.id === block.id) as AgentBlock | undefined) ?? live.current;

  // Ask the model for the next step whenever we are "thinking".
  useEffect(() => {
    if (block.status !== 'thinking' || requestId.current) return;
    const id = crypto.randomUUID();
    requestId.current = id;
    const b = current();
    const ran = b.steps.filter((s) => s.state === 'ran' || s.state === 'skipped');
    if (ran.length >= maxSteps) {
      requestId.current = null;
      patch({ status: 'done', summary: `Stopped after ${maxSteps} steps (the limit in Settings).` });
      return;
    }
    invoke<StepReply>('ai_agent_step', {
      requestId: id,
      goal: b.goal,
      cwd: useBlocks.getState().byPane[paneId]?.cwd || b.cwd || null,
      steps: ran.map((s) => ({ command: s.command, exitCode: s.exitCode ?? null, output: s.output ?? '', skipped: s.state === 'skipped' })),
    })
      .then((r) => {
        if (requestId.current !== id) return;
        requestId.current = null;
        const now = current();
        if (now.status !== 'thinking') return;
        if (r.done || !r.command) {
          patch({ status: 'done', summary: r.summary || r.thought });
          return;
        }
        const step: AgentStep = { thought: r.thought, command: r.command, risk: r.risk, state: 'proposed' };
        patch({ status: 'waiting', steps: [...now.steps, step] });
        if (autoRunSafe && r.risk === 'safe') void runStep(r.command);
      })
      .catch((e) => {
        if (requestId.current !== id) return;
        requestId.current = null;
        if (String(e) !== 'cancelled') patch({ status: 'error', error: String(e) });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.status]);

  const updateLast = (p: Partial<AgentStep>) => {
    const b = current();
    const steps = b.steps.slice();
    steps[steps.length - 1] = { ...steps[steps.length - 1], ...p };
    return steps;
  };

  const runStep = async (command?: string) => {
    const b = current();
    const last = b.steps.at(-1);
    if (!last || last.state !== 'proposed') return;
    if (!command && last.risk === 'danger' && !confirm) {
      setConfirm(true);
      return;
    }
    setConfirm(false);
    patch({ status: 'running', steps: updateLast({ state: 'running' }) });
    const done = (await onRun(last.command)) as { exitCode: number | null; output: string } | null;
    if (current().status !== 'running') return;
    patch({
      status: 'thinking',
      steps: updateLast({ state: 'ran', exitCode: done?.exitCode ?? null, output: done?.output ?? '' }),
    });
  };

  const skip = () => patch({ status: 'thinking', steps: updateLast({ state: 'skipped' }) });
  const stop = () => {
    if (requestId.current) invoke('ai_cancel', { requestId: requestId.current });
    requestId.current = null;
    patch({ status: 'stopped' });
  };
  const edit = () => {
    const last = current().steps.at(-1);
    if (last) insertIntoPrompt(paneId, last.command);
    stop();
  };

  const busy = block.status === 'thinking' || block.status === 'running' || block.status === 'waiting';

  return (
    <div className="mx-2 rounded-lg border border-chart-5/30 bg-chart-5/[0.04] px-4 py-2.5 animate-rise-in">
      <div className="flex items-center gap-2 text-app-label">
        <Bot className="size-4 shrink-0 text-chart-5" />
        <span className="font-medium text-foreground">Agent</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{block.goal}</span>
        {busy && (
          <Button size="sm" variant="ghost" className="h-7" onClick={stop}>
            <CircleStop /> Stop
          </Button>
        )}
      </div>

      <ol className="mt-2 space-y-2 pl-6">
        {block.steps.map((s, i) => (
          <li key={i} className="relative">
            <span
              className={cn(
                'absolute -left-6 top-0.5 flex size-4 items-center justify-center rounded-full text-[10px] font-medium',
                s.state === 'ran' && (s.exitCode === 0 ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'),
                s.state === 'skipped' && 'bg-muted text-muted-foreground',
                (s.state === 'proposed' || s.state === 'running') && 'bg-chart-5/15 text-chart-5',
              )}
            >
              {s.state === 'ran' ? s.exitCode === 0 ? <Check className="size-3" /> : <X className="size-3" /> : i + 1}
            </span>
            <p className="text-app-caption text-muted-foreground">{s.thought}</p>
            <div
              className={cn(
                'mt-1 flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-[0.92em]',
                s.state === 'skipped' && 'line-through opacity-50',
              )}
            >
              <span className="min-w-0 flex-1 break-all">
                <CommandText text={s.command} />
              </span>
              {s.state === 'running' && <Loader2 className="size-3.5 animate-spin text-chart-5" />}
              {s.state === 'ran' && s.exitCode !== 0 && <span className="text-app-caption text-destructive">exit {s.exitCode}</span>}
            </div>
            {s.state === 'proposed' && block.status === 'waiting' && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <RiskBadge risk={s.risk} />
                <span className="flex-1" />
                <Button size="sm" variant="ghost" onClick={skip}>
                  <SkipForward /> Skip
                </Button>
                <Button size="sm" variant="outline" onClick={edit}>
                  <Pencil /> Edit
                </Button>
                <Button size="sm" variant={confirm ? 'destructive' : 'default'} onClick={() => runStep()}>
                  <Play /> {confirm ? 'Run anyway' : 'Run'}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ol>

      {block.status === 'thinking' && (
        <p className="mt-2 flex items-center gap-2 pl-6 text-app-caption text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> Planning the next step…
        </p>
      )}
      {block.status === 'done' && block.summary && (
        <p className="mt-2 rounded-md bg-success/10 px-3 py-2 text-app-label text-foreground">{block.summary}</p>
      )}
      {block.status === 'stopped' && <p className="mt-2 pl-6 text-app-caption text-muted-foreground">Stopped.</p>}
      {block.status === 'error' && <p className="mt-2 pl-6 text-app-caption text-destructive">{block.error}</p>}
    </div>
  );
}
