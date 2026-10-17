import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Bot, ChevronRight, File, Folder, GitBranch, Sparkles, SquareTerminal } from 'lucide-react';
import { useSettings } from '../../stores/settings';
import { recentCommands } from '../../stores/blocks';
import { getHistory, looksLikeNaturalLanguage, suggestFromHistory } from '../../lib/shellData';
import { shortPath } from '../../lib/format';
import { cn } from '../../lib/utils';
import { tokenize } from './CommandText';

export type EditorMode = 'shell' | 'ai' | 'agent';
export type EditorHandle = { setValue: (v: string) => void; focus: () => void };

type Completion = { value: string; kind: 'command' | 'dir' | 'file' };

const MODE_META: Record<EditorMode, { label: string; icon: typeof Sparkles; tint: string; placeholder: string }> = {
  shell: { label: 'Shell', icon: SquareTerminal, tint: 'text-muted-foreground', placeholder: 'Run a command, or just describe what you want…' },
  ai: { label: 'AI', icon: Sparkles, tint: 'text-brand', placeholder: 'Ask AI for a command…' },
  agent: { label: 'Agent', icon: Bot, tint: 'text-chart-5', placeholder: 'Describe a goal; the agent works through it step by step…' },
};

function commonPrefix(items: string[]) {
  if (!items.length) return '';
  let p = items[0];
  for (const s of items) while (!s.startsWith(p)) p = p.slice(0, -1);
  return p;
}

export const InputEditor = forwardRef<
  EditorHandle,
  {
    paneId: number;
    cwd: string;
    gitBranch: string | null;
    hidden: boolean;
    flush?: boolean;
    onSubmit: (text: string, mode: EditorMode) => void;
    onFocus: () => void;
  }
>(function InputEditor({ paneId, cwd, gitBranch, hidden, flush, onSubmit, onFocus }, ref) {
  const nlDetection = useSettings((s) => s.nlDetection);
  const historySuggestions = useSettings((s) => s.historySuggestions);
  const aiAutosuggest = useSettings((s) => s.aiAutosuggest);
  const fontFamily = useSettings((s) => s.fontFamily);
  const fontSize = useSettings((s) => s.fontSize);
  const inputTop = useSettings((s) => s.inputPosition === 'top');

  const [value, setValue] = useState('');
  const [override, setOverride] = useState<EditorMode | null>(null);
  const [completions, setCompletions] = useState<{ items: Completion[]; index: number; start: number; end: number } | null>(null);
  const [aiGhost, setAiGhost] = useState<{ base: string; full: string } | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const area = useRef<HTMLTextAreaElement>(null);
  const hist = useRef<{ idx: number; draft: string } | null>(null);

  useImperativeHandle(ref, () => ({
    setValue: (v) => {
      setValue(v);
      setOverride('shell');
      requestAnimationFrame(() => {
        area.current?.focus();
        area.current?.setSelectionRange(v.length, v.length);
      });
    },
    focus: () => area.current?.focus(),
  }));

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const autoMode: EditorMode = value.startsWith('#') ? 'ai' : nlDetection && looksLikeNaturalLanguage(value) ? 'ai' : 'shell';
  const mode = override ?? autoMode;

  const historyGhost = useMemo(() => {
    if (mode !== 'shell' || !historySuggestions) return null;
    const s = suggestFromHistory(value);
    return s ? s.slice(value.length) : null;
  }, [value, mode, historySuggestions]);
  const ghost = historyGhost ?? (aiGhost && aiGhost.base === value ? aiGhost.full.slice(value.length) : null);

  // Opt-in AI completion after a pause, when history has nothing.
  useEffect(() => {
    if (!aiAutosuggest || mode !== 'shell' || historyGhost || value.trim().length < 3 || value.includes('\n')) return;
    const base = value;
    const id = crypto.randomUUID();
    const t = setTimeout(() => {
      invoke<{ command: string }>('ai_suggest', {
        requestId: id,
        prompt: `Complete this partially typed shell command, keeping what is typed as the exact prefix: ${base}`,
        cwd: cwd || null,
        recent: recentCommands(paneId),
      })
        .then((r) => {
          if (r.command.startsWith(base) && r.command.length > base.length) setAiGhost({ base, full: r.command });
        })
        .catch(() => {});
    }, 700);
    return () => {
      clearTimeout(t);
      invoke('ai_cancel', { requestId: id }).catch(() => {});
    };
  }, [value, aiAutosuggest, mode, historyGhost, cwd, paneId]);

  // Grow with content.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [value, fontSize, hidden]);

  const set = (v: string, caret?: number) => {
    setValue(v);
    setCompletions(null);
    if (!v) setOverride(null);
    if (caret !== undefined) requestAnimationFrame(() => area.current?.setSelectionRange(caret, caret));
  };

  const submit = () => {
    const text = value;
    if (!text.trim()) return;
    hist.current = null;
    setValue('');
    setOverride(null);
    setCompletions(null);
    setAiGhost(null);
    onSubmit(text, mode);
  };

  const applyCompletion = (c: Completion, start: number, end: number) => {
    const suffix = c.kind === 'dir' ? '' : ' ';
    const next = value.slice(0, start) + c.value + suffix + value.slice(end);
    set(next, start + c.value.length + suffix.length);
  };

  const requestCompletion = async () => {
    const el = area.current!;
    const caret = el.selectionStart;
    const line = value.slice(0, caret);
    const start = Math.max(line.lastIndexOf(' '), line.lastIndexOf('|'), line.lastIndexOf(';'), line.lastIndexOf('&'), line.lastIndexOf('\n'), line.lastIndexOf('(')) + 1;
    const items = await invoke<Completion[]>('complete', { line, cwd: cwd || '/' }).catch(() => [] as Completion[]);
    if (!items.length) return;
    if (items.length === 1) return applyCompletion(items[0], start, caret);
    const prefix = commonPrefix(items.map((i) => i.value));
    if (prefix.length > caret - start) {
      const next = value.slice(0, start) + prefix + value.slice(caret);
      setValue(next);
      requestAnimationFrame(() => area.current?.setSelectionRange(start + prefix.length, start + prefix.length));
    }
    setCompletions({ items, index: 0, start, end: start + Math.max(prefix.length, caret - start) });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const atEnd = el.selectionStart === value.length && el.selectionEnd === value.length;
    const onFirstLine = !value.slice(0, el.selectionStart).includes('\n');
    const onLastLine = !value.slice(el.selectionEnd).includes('\n');

    if (completions) {
      if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        setCompletions({ ...completions, index: (completions.index + 1) % completions.items.length });
        return;
      }
      if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
        e.preventDefault();
        setCompletions({ ...completions, index: (completions.index - 1 + completions.items.length) % completions.items.length });
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        applyCompletion(completions.items[completions.index], completions.start, completions.end);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setCompletions(null);
        return;
      }
      setCompletions(null);
    }

    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Tab' && mode === 'shell') {
      e.preventDefault();
      void requestCompletion();
    } else if ((e.key === 'ArrowRight' || e.key === 'End') && atEnd && ghost && !e.altKey) {
      e.preventDefault();
      set(value + ghost, value.length + ghost.length);
    } else if (e.key === 'ArrowRight' && e.altKey && atEnd && ghost) {
      e.preventDefault();
      const word = ghost.match(/^\s*\S+/)?.[0] ?? ghost;
      set(value + word, value.length + word.length);
    } else if (e.key === 'ArrowUp' && onFirstLine && !e.metaKey) {
      const h = getHistory();
      if (!h.length) return;
      e.preventDefault();
      const cur = hist.current ?? { idx: h.length, draft: value };
      // Like zsh's up-line-or-beginning-search: only entries starting with what was typed.
      let i = cur.idx - 1;
      while (i >= 0 && cur.draft && !h[i].startsWith(cur.draft)) i--;
      if (i < 0) return;
      hist.current = { idx: i, draft: cur.draft };
      setValue(h[i]);
      setOverride('shell');
    } else if (e.key === 'ArrowDown' && onLastLine && hist.current && !e.metaKey) {
      e.preventDefault();
      const h = getHistory();
      const cur = hist.current;
      let i = cur.idx + 1;
      while (i < h.length && cur.draft && !h[i].startsWith(cur.draft)) i++;
      if (i >= h.length) {
        hist.current = null;
        setValue(cur.draft);
        setOverride(null);
      } else {
        hist.current = { idx: i, draft: cur.draft };
        setValue(h[i]);
      }
    } else if (e.key === 'i' && e.metaKey) {
      e.preventDefault();
      const order: EditorMode[] = ['shell', 'ai', 'agent'];
      setOverride(order[(order.indexOf(mode) + 1) % order.length]);
    } else if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      set('');
    } else if (e.key === 'Escape') {
      if (override) setOverride(null);
      else if (value) set('');
    }
  };

  const meta = MODE_META[mode];
  const tokens = mode === 'shell' ? tokenize(value) : [{ text: value, cls: '' }];
  const font = { fontFamily: `"${fontFamily}", "JetBrains Mono Variable", Menlo, monospace`, fontSize: fontSize + 1 };

  if (hidden) return null;

  return (
    <div
      className={cn(
        'relative flex-none border-border bg-background px-4 pb-3 pt-2 transition-colors duration-fast',
        !flush && (inputTop ? 'border-b' : 'border-t'),
        mode === 'ai' && 'bg-brand/[0.03]',
        mode === 'agent' && 'bg-chart-5/[0.03]',
      )}
      onMouseDown={(e) => {
        onFocus();
        if (e.target === e.currentTarget) {
          e.preventDefault();
          area.current?.focus();
        }
      }}
    >
      {/* Prompt context, Warp-style chips */}
      <div className="mb-1.5 flex items-center gap-2 text-app-caption">
        <span className="flex items-center gap-1 rounded-md bg-accent/70 px-1.5 py-0.5 text-foreground/80">
          <Folder className="size-3" /> {shortPath(cwd) || '~'}
        </span>
        {gitBranch && (
          <span className="flex items-center gap-1 rounded-md bg-brand/10 px-1.5 py-0.5 text-brand">
            <GitBranch className="size-3" /> {gitBranch}
          </span>
        )}
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const order: EditorMode[] = ['shell', 'ai', 'agent'];
            setOverride(order[(order.indexOf(mode) + 1) % order.length]);
            area.current?.focus();
          }}
          title="Switch mode (⌘I)"
          className={cn('flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent', meta.tint)}
        >
          <meta.icon className="size-3" /> {meta.label}
          {!override && mode !== 'shell' && <span className="opacity-60">· auto</span>}
        </button>
        <span className="ml-auto text-muted-foreground/70">
          {clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div className="relative flex items-start gap-2">
        <ChevronRight className={cn('mt-[3px] size-4 shrink-0', meta.tint)} />
        <div className="relative min-w-0 flex-1" style={font}>
          <pre
            aria-hidden
            className="pointer-events-none absolute inset-0 m-0 whitespace-pre-wrap break-all leading-[1.5] text-foreground"
            style={font}
          >
            {tokens.map((t, i) => (
              <span key={i} className={cn(t.cls, mode === 'ai' && 'text-brand', mode === 'agent' && 'text-chart-5')}>
                {t.text}
              </span>
            ))}
            {ghost && <span className="text-muted-foreground/50">{ghost}</span>}
            {'​'}
          </pre>
          <textarea
            ref={area}
            value={value}
            rows={1}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            placeholder={meta.placeholder}
            onFocus={onFocus}
            onChange={(e) => {
              setValue(e.target.value);
              hist.current = null;
              if (completions) setCompletions(null);
            }}
            onKeyDown={onKeyDown}
            className="relative block w-full resize-none overflow-hidden border-0 bg-transparent p-0 leading-[1.5] text-transparent caret-brand outline-none placeholder:text-muted-foreground/60 selection:bg-brand/25"
            style={font}
          />
        </div>
      </div>

      {completions && (
        <div
          className={cn(
            'absolute left-10 z-30 max-h-56 w-80 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg animate-pop-in',
            inputTop ? 'top-full mt-1' : 'bottom-full mb-1',
          )}
        >
          {completions.items.map((c, i) => (
            <button
              key={c.value}
              onMouseDown={(e) => {
                e.preventDefault();
                applyCompletion(c, completions.start, completions.end);
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left font-mono text-app-caption',
                i === completions.index ? 'bg-accent text-foreground' : 'text-foreground/80',
              )}
            >
              {c.kind === 'dir' ? (
                <Folder className="size-3 text-brand" />
              ) : c.kind === 'file' ? (
                <File className="size-3 text-muted-foreground" />
              ) : (
                <SquareTerminal className="size-3 text-chart-2" />
              )}
              <span className="truncate">{c.value}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
