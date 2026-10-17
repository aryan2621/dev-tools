import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { Copy, CornerDownLeft } from 'lucide-react';
import { formatDuration, formatRelative, shortPath } from '../lib/format';
import { copyText } from '../lib/copy';
import { cn } from '../lib/utils';
import { Hint } from './ui/tooltip';
import { CommandText } from './terminal/CommandText';

export type HistoryRow = {
  id: string;
  command: string;
  cwd: string;
  gitBranch: string | null;
  startedAt: number;
  finishedAt: number;
  exitCode: number;
};

/** Sends a command to the terminal window's active pane and brings that window forward. */
function insert(cmd: string) {
  void emit('insert-command', cmd);
  invoke('focus_terminal').catch(() => {});
}

/** One command from history: status, folder, how long it took, and copy / insert on hover. */
export function CommandRow({ row }: { row: HistoryRow }) {
  const failed = row.exitCode !== 0 && row.exitCode !== 130;
  return (
    <div className="group flex items-center gap-3 border-b px-5 py-3 last:border-0 hover:bg-accent/40">
      <span className={cn('size-1.5 shrink-0 rounded-full', failed ? 'bg-destructive' : 'bg-success')} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-[13px]">
          <CommandText text={row.command} />
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {shortPath(row.cwd)}
          {row.gitBranch ? ` · ${row.gitBranch}` : ''}
        </div>
      </div>
      {failed && <span className="rounded-md bg-destructive/10 px-1.5 font-mono text-xs text-destructive">{row.exitCode}</span>}
      <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">{formatDuration(row.finishedAt - row.startedAt)}</span>
      <Hint text={new Date(row.startedAt).toLocaleString()}>
        <span className="w-20 text-right text-xs text-muted-foreground">{formatRelative(row.startedAt)}</span>
      </Hint>
      <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <Hint text="Copy">
          <button onClick={() => copyText(row.command, 'Command copied')} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <Copy className="size-3.5" />
          </button>
        </Hint>
        <Hint text="Insert in terminal">
          <button onClick={() => insert(row.command)} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <CornerDownLeft className="size-3.5" />
          </button>
        </Hint>
      </div>
    </div>
  );
}
