import { memo, useState } from 'react';
import {
  Bookmark,
  ChevronDown,
  ChevronRight,
  Copy,
  CopyCheck,
  MessageSquarePlus,
  MoreHorizontal,
  RotateCw,
  Sparkles,
  Folder,
  GitBranch,
  Clock,
} from 'lucide-react';
import { ShellBlock, useBlocks } from '../../stores/blocks';
import { useSettings } from '../../stores/settings';
import { formatClock, formatDuration, formatRelative, shortPath } from '../../lib/format';
import { cn } from '../../lib/utils';
import { Hint } from '../ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { ExplainInline } from './ExplainInline';
import { CommandText } from './CommandText';
import { copyText } from '../../lib/copy';

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Hint text={label}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors duration-fast hover:bg-accent hover:text-foreground [&_svg]:size-3.5"
      >
        {children}
      </button>
    </Hint>
  );
}

export const BlockCard = memo(function BlockCard({
  paneId,
  block,
  now,
  selected,
  onSelect,
  onRerun,
  onAttach,
}: {
  paneId: number;
  block: ShellBlock;
  now: number;
  selected: boolean;
  onSelect: () => void;
  onRerun: () => void;
  onAttach: () => void;
}) {
  const showTimestamps = useSettings((s) => s.showTimestamps);
  const showDuration = useSettings((s) => s.showDuration);
  const compact = useSettings((s) => s.compactBlocks);
  const maxLines = useSettings((s) => s.maxOutputLines);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState<'cmd' | 'out' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const failed = block.exitCode !== null && block.exitCode !== 0 && block.exitCode !== 130;
  const interrupted = block.exitCode === 130;
  const collapsed = !!block.collapsed;
  const long = block.lines > maxLines;
  const patch = (p: Partial<ShellBlock>) => useBlocks.getState().patchBlock<ShellBlock>(paneId, block.id, p);

  const copy = (what: 'cmd' | 'out') => {
    copyText(what === 'cmd' ? block.command : block.output, what === 'cmd' ? 'Command copied' : 'Output copied');
    setCopied(what);
    setTimeout(() => setCopied(null), 1200);
  };

  const duration = block.finishedAt ? block.finishedAt - block.startedAt : 0;

  return (
    <div
      id={`block-${block.id}`}
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuOpen(true);
      }}
      className={cn(
        'group relative mx-2 rounded-lg border border-transparent transition-colors duration-fast animate-rise-in',
        compact ? 'py-1' : 'py-2',
        failed ? 'bg-destructive/[0.06]' : 'hover:bg-accent/40',
        selected && 'border-brand/50 bg-brand/[0.05]',
      )}
    >
      {/* Warp-style status rail */}
      <div
        className={cn(
          'absolute bottom-1 left-0 top-1 w-[3px] rounded-full',
          failed ? 'bg-destructive' : interrupted ? 'bg-warning/70' : 'bg-transparent group-hover:bg-success/40',
        )}
      />

      {/* Header: sticks to the top while a long block scrolls past */}
      <div className="sticky top-0 z-10 flex items-start gap-2 rounded-t-lg bg-background/85 px-4 backdrop-blur-sm">
        <button
          onClick={(e) => {
            e.stopPropagation();
            patch({ collapsed: !collapsed });
          }}
          className="mt-[3px] text-muted-foreground/60 hover:text-foreground"
        >
          {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
        <div className="min-w-0 flex-1">
          {!compact && (
            <div className="mb-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-app-caption text-muted-foreground">
              <span className="flex items-center gap-1">
                <Folder className="size-3" />
                {shortPath(block.cwd) || '~'}
              </span>
              {block.gitBranch && (
                <span className="flex items-center gap-1 text-brand/90">
                  <GitBranch className="size-3" />
                  {block.gitBranch}
                </span>
              )}
              {showTimestamps && (
                <Hint text={new Date(block.startedAt).toLocaleString()}>
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {formatClock(block.startedAt)}
                    <span className="opacity-60">· {formatRelative(block.startedAt, now)}</span>
                  </span>
                </Hint>
              )}
            </div>
          )}
          <div className="break-all font-mono text-[0.95em] leading-snug text-foreground">
            <CommandText text={block.command} />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-fast group-hover:opacity-100">
            <ToolButton label="Copy command" onClick={() => copy('cmd')}>
              {copied === 'cmd' ? <CopyCheck /> : <Copy />}
            </ToolButton>
            <ToolButton label="Rerun" onClick={onRerun}>
              <RotateCw />
            </ToolButton>
            <ToolButton label="Ask AI about this block" onClick={onAttach}>
              <MessageSquarePlus />
            </ToolButton>
            {failed && (
              <ToolButton label="Explain & fix (⌘E)" onClick={() => patch({ explainOpen: !block.explainOpen })}>
                <Sparkles />
              </ToolButton>
            )}
          </div>
          {block.bookmarked && <Bookmark className="size-3.5 fill-brand text-brand" />}
          {showDuration && <span className="tabular-nums text-app-caption text-muted-foreground">{formatDuration(duration)}</span>}
          {failed ? (
            <span className="rounded-md bg-destructive/10 px-1.5 py-0.5 font-mono text-app-caption font-medium text-destructive">
              {block.exitCode}
            </span>
          ) : interrupted ? (
            <span className="rounded-md bg-warning/10 px-1.5 py-0.5 text-app-caption text-warning">^C</span>
          ) : null}
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 data-[state=open]:opacity-100"
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => copy('cmd')}>Copy command</DropdownMenuItem>
              <DropdownMenuItem onClick={() => copy('out')}>Copy output</DropdownMenuItem>
              <DropdownMenuItem onClick={() => copyText(`$ ${block.command}\n${block.output}`, 'Block copied')}>
                Copy command and output
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onRerun}>Rerun</DropdownMenuItem>
              <DropdownMenuItem onClick={onAttach}>Ask AI about this block</DropdownMenuItem>
              {failed && <DropdownMenuItem onClick={() => patch({ explainOpen: true })}>Explain & fix</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => patch({ bookmarked: !block.bookmarked })}>
                {block.bookmarked ? 'Remove bookmark' : 'Bookmark'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => patch({ collapsed: !collapsed })}>{collapsed ? 'Expand' : 'Collapse'}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {!collapsed && block.html && (
        <div className="relative px-4 pl-[38px] pt-1">
          <div
            className={cn('wall-output overflow-x-auto', long && !expanded && 'wall-output-clamp')}
            style={long && !expanded ? { maxHeight: `calc(${maxLines} * var(--wall-line-height) * 1em)` } : undefined}
            onClick={(e) => e.stopPropagation()}
            dangerouslySetInnerHTML={{ __html: block.html }}
          />
          {long && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="mt-1 text-app-caption font-medium text-brand hover:underline"
            >
              {expanded ? 'Show less' : `Show all ${block.lines} lines`}
            </button>
          )}
        </div>
      )}

      {block.explainOpen && (
        <div className="px-4 pl-[38px] pt-2" onClick={(e) => e.stopPropagation()}>
          <ExplainInline paneId={paneId} block={block} onClose={() => patch({ explainOpen: false })} />
        </div>
      )}
    </div>
  );
});
