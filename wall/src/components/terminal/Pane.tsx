import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { SerializeAddon } from '@xterm/addon-serialize';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { Loader2, Search, Square, X } from 'lucide-react';
import { useBlocks, ShellBlock, Block, shellBlocks } from '../../stores/blocks';
import { useSettings } from '../../stores/settings';
import { registerPane, unregisterPane } from '../../lib/ptyRegistry';
import { terminalTheme } from '../../lib/terminalTheme';
import { pushHistory } from '../../lib/shellData';
import { useChat } from '../../stores/chat';
import { BlockCard } from './BlockCard';
import { AiBlockCard } from './AiBlockCard';
import { AgentBlockCard } from './AgentBlockCard';
import { InputEditor, EditorHandle, EditorMode } from './InputEditor';
import { EmptyState } from './EmptyState';
import { cn } from '../../lib/utils';
import { formatDuration } from '../../lib/format';
import { copyText } from '../../lib/copy';

function decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Rows the running command has actually written to (at least 1). */
function usedRows(term: XTerm) {
  const b = term.buffer.active;
  const line = b.getLine(b.baseY + b.cursorY)?.translateToString(true) ?? '';
  return Math.max(b.baseY + b.cursorY + (b.cursorX > 0 || line.length > 0 ? 1 : 0), 1);
}

function plainOutput(term: XTerm) {
  const b = term.buffer.active;
  const end = b.baseY + b.cursorY;
  const lines: string[] = [];
  for (let i = 0; i <= end; i++) lines.push(b.getLine(i)?.translateToString(true) ?? '');
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  return lines.join('\n');
}

/** Colored HTML of the finished block, with xterm's wrapper styles stripped and trailing blank rows dropped. */
function htmlOutput(ser: SerializeAddon): { html: string; lines: number } {
  const raw = ser.serializeAsHTML({ includeGlobalBackground: false });
  const start = raw.indexOf('<!--StartFragment-->');
  const end = raw.indexOf('<!--EndFragment-->');
  const fragment = start >= 0 && end > start ? raw.slice(start + 20, end) : raw;
  const doc = new DOMParser().parseFromString(`<div>${fragment}</div>`, 'text/html');
  const rows = doc.querySelector('pre > div');
  if (!rows) return { html: '', lines: 0 };
  rows.removeAttribute('style');
  while (rows.lastElementChild && !rows.lastElementChild.textContent?.trim()) rows.lastElementChild.remove();
  return { html: rows.childElementCount ? rows.outerHTML : '', lines: rows.childElementCount };
}

export function Pane({
  paneId,
  active,
  visible,
  onFocus,
  onExit,
}: {
  paneId: number;
  /** focused pane of the visible tab */
  active: boolean;
  /** its tab is the visible one */
  visible: boolean;
  onFocus: () => void;
  onExit: () => void;
}) {
  const settings = useSettings();
  const pane = useBlocks((s) => s.byPane[paneId]);
  const blocks = pane?.blocks ?? [];
  const running = pane?.running ?? false;
  const mode = pane?.mode ?? 'boot';

  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const liveHost = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const editor = useRef<EditorHandle>(null);
  const ptyId = useRef(crypto.randomUUID());
  const waiters = useRef<((b: ShellBlock | null) => void)[]>([]);
  const callbacks = useRef({ onExit, active });
  callbacks.current = { onExit, active };

  const [alt, setAlt] = useState(false);
  const [liveRows, setLiveRows] = useState(1);
  const [cellH, setCellH] = useState(18);
  const [paneH, setPaneH] = useState(400);
  const [selected, setSelected] = useState<string | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [now, setNow] = useState(Date.now());
  const stickBottom = useRef(true);

  const write = useCallback((data: string) => {
    invoke('pty_write', { id: ptyId.current, data });
  }, []);

  const run = useCallback(
    (command: string): Promise<ShellBlock | null> => {
      const cmd = command.replace(/\s+$/, '');
      if (!cmd.trim()) return Promise.resolve(null);
      pushHistory(cmd);
      if (/^\s*(clear|reset|cls)\s*$/.test(cmd)) {
        useBlocks.getState().clear(paneId);
        return Promise.resolve(null);
      }
      stickBottom.current = true;
      // Ctrl-U clears whatever zle holds; multi-line text goes in as a bracketed paste so it runs as one.
      const body = cmd.includes('\n') ? `\x1b[200~${cmd}\x1b[201~` : cmd;
      write(`\x15${body}\r`);
      return new Promise((resolve) => waiters.current.push(resolve));
    },
    [paneId, write],
  );

  // ---- PTY + xterm lifecycle -------------------------------------------------------------------
  useEffect(() => {
    const s = useSettings.getState();
    const term = new XTerm({
      fontFamily: `"${s.fontFamily}", "JetBrains Mono Variable", Menlo, monospace`,
      fontSize: s.fontSize,
      lineHeight: s.lineHeight,
      cursorBlink: s.cursorBlink,
      cursorStyle: s.cursorStyle,
      scrollback: s.scrollback,
      allowProposedApi: true,
      minimumContrastRatio: 4.5,
      theme: terminalTheme(),
      macOptionIsMeta: true,
    });
    const fit = new FitAddon();
    const ser = new SerializeAddon();
    term.loadAddon(fit);
    term.loadAddon(ser);
    term.open(liveHost.current!);
    try {
      const gl = new WebglAddon();
      gl.onContextLoss(() => gl.dispose());
      term.loadAddon(gl);
    } catch {
      // DOM renderer fallback
    }
    termRef.current = term;
    fitRef.current = fit;
    const store = useBlocks.getState();
    store.patchPane(paneId, { mode: 'boot', running: false });

    const id = ptyId.current;
    let state: 'boot' | 'prompt' | 'running' = 'boot';
    let classic = false;
    let bootBuf = '';
    let carry = '';
    const decoder = new TextDecoder();

    const emit = (seg: string) => {
      if (!seg) return;
      if (classic || state === 'running') term.write(seg);
      else if (state === 'boot' && bootBuf.length < 256 * 1024) bootBuf += seg;
    };

    const refreshBranch = (cwd: string) => {
      invoke<string | null>('git_info', { cwd })
        .then((gitBranch) => useBlocks.getState().patchPane(paneId, { gitBranch }))
        .catch(() => {});
    };

    const on133 = (arg: string) => {
      const kind = arg[0];
      const rest = arg.slice(2);
      if (kind === 'A') {
        if (state === 'boot') {
          clearTimeout(classicTimer);
          useBlocks.getState().patchPane(paneId, { mode: 'blocks' });
        }
        if (state !== 'running') state = 'prompt';
      } else if (kind === 'C') {
        if (classic) return;
        state = 'running';
        term.write('\x1bc'); // fresh screen for this block
        useBlocks.getState().startShell(paneId, rest.replace(/\r/g, ''));
        setLiveRows(1);
        if (callbacks.current.active) setTimeout(() => term.focus(), 0);
      } else if (kind === 'D') {
        if (classic || state !== 'running') return;
        state = 'prompt';
        const code = parseInt(rest, 10) || 0;
        // Runs after every byte queued before it has been parsed.
        term.write('', () => {
          const { html, lines } = htmlOutput(ser);
          const output = plainOutput(term);
          const done = useBlocks.getState().finishShell(paneId, code, html, output, lines);
          if (done) {
            invoke('history_record', {
              row: {
                id: done.id,
                command: done.command,
                cwd: done.cwd,
                gitBranch: done.gitBranch,
                startedAt: done.startedAt,
                finishedAt: done.finishedAt,
                exitCode: code,
                outputTail: output.slice(-4000),
              },
            }).catch(() => {});
          }
          waiters.current.shift()?.(done);
          if (callbacks.current.active) editor.current?.focus();
        });
      }
    };

    const on7 = (data: string) => {
      try {
        const cwd = decodeURIComponent(new URL(data).pathname);
        if (cwd !== useBlocks.getState().byPane[paneId]?.cwd) {
          useBlocks.getState().patchPane(paneId, { cwd });
          refreshBranch(cwd);
        }
      } catch {
        // ignore malformed reports
      }
    };

    // Splits the byte stream on Wall's OSC markers. Partial sequences at a chunk edge are carried over.
    const feed = (text: string) => {
      let s = carry + text;
      carry = '';
      let i = 0;
      for (;;) {
        const j = s.indexOf('\x1b]', i);
        if (j === -1) {
          if (s.endsWith('\x1b')) {
            emit(s.slice(i, -1));
            carry = '\x1b';
          } else emit(s.slice(i));
          return;
        }
        emit(s.slice(i, j));
        const bel = s.indexOf('\x07', j);
        const st = s.indexOf('\x1b\\', j);
        let end = -1;
        let tlen = 0;
        if (bel !== -1 && (st === -1 || bel < st)) {
          end = bel;
          tlen = 1;
        } else if (st !== -1) {
          end = st;
          tlen = 2;
        }
        if (end === -1) {
          if (s.length - j > 8192) {
            emit(s.slice(j)); // not a real OSC; don't hold output forever
          } else carry = s.slice(j);
          return;
        }
        const body = s.slice(j + 2, end);
        if (body.startsWith('133;')) on133(body.slice(4));
        else if (body.startsWith('7;')) on7(body.slice(2));
        else emit(s.slice(j, end + tlen)); // titles, hyperlinks: xterm handles them
        i = end + tlen;
      }
    };

    // No shell integration (bash, fish…): behave like a classic terminal.
    const classicTimer = setTimeout(() => {
      if (state !== 'boot') return;
      classic = true;
      useBlocks.getState().patchPane(paneId, { mode: 'classic' });
      term.write(bootBuf);
      bootBuf = '';
      setTimeout(() => term.focus(), 0);
    }, 4000);

    let disposed = false;
    const unlisten: UnlistenFn[] = [];
    (async () => {
      const [u1, u2] = await Promise.all([
        listen<string>(`pty://data/${id}`, (e) => feed(decoder.decode(decode(e.payload), { stream: true }))),
        listen(`pty://exit/${id}`, () => callbacks.current.onExit()),
      ]);
      unlisten.push(u1, u2);
      if (disposed) return unlisten.forEach((u) => u());
      fit.fit();
      await invoke('pty_spawn', { id, cols: term.cols, rows: term.rows, cwd: null });
      if (disposed) invoke('pty_kill', { id });
    })();

    const d1 = term.onData((data) => invoke('pty_write', { id, data }));
    const d2 = term.onResize(({ cols, rows }) => invoke('pty_resize', { id, cols, rows }));
    const d3 = term.buffer.onBufferChange((b) => setAlt(b.type === 'alternate'));
    let raf = 0;
    const d4 = term.onWriteParsed(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setLiveRows(usedRows(term)));
    });
    const d5 = term.onSelectionChange(() => {
      if (useSettings.getState().copyOnSelect && term.hasSelection()) navigator.clipboard.writeText(term.getSelection());
    });
    const themeObserver = new MutationObserver(() => {
      term.options.theme = terminalTheme();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });

    registerPane(paneId, {
      run,
      insert: (text) => editor.current?.setValue(text),
      focus: () => (state === 'running' || classic ? term.focus() : editor.current?.focus()),
      write: (data) => invoke('pty_write', { id, data }),
    });

    return () => {
      disposed = true;
      clearTimeout(classicTimer);
      cancelAnimationFrame(raf);
      themeObserver.disconnect();
      [d1, d2, d3, d4, d5].forEach((d) => d.dispose());
      unlisten.forEach((u) => u());
      invoke('pty_kill', { id });
      unregisterPane(paneId);
      useBlocks.getState().removePane(paneId);
      waiters.current.forEach((w) => w(null));
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live settings: font, cursor, scrollback.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontFamily = `"${settings.fontFamily}", "JetBrains Mono Variable", Menlo, monospace`;
    term.options.fontSize = settings.fontSize;
    term.options.lineHeight = settings.lineHeight;
    term.options.cursorStyle = settings.cursorStyle;
    term.options.cursorBlink = settings.cursorBlink;
    term.options.scrollback = settings.scrollback;
    requestAnimationFrame(() => refit());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.fontFamily, settings.fontSize, settings.lineHeight, settings.cursorStyle, settings.cursorBlink, settings.scrollback]);

  // The xterm is always sized to the whole pane, so programs see real rows; only the used rows are shown.
  const refit = useCallback(() => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit || !root.current || root.current.offsetParent === null) return;
    setPaneH(root.current.clientHeight);
    fit.fit();
    const screen = term.element?.querySelector('.xterm-screen') as HTMLElement | null;
    if (screen && term.rows) setCellH(screen.clientHeight / term.rows);
  }, []);

  useEffect(() => {
    const ro = new ResizeObserver(() => refit());
    if (root.current) ro.observe(root.current);
    return () => ro.disconnect();
  }, [refit]);

  useEffect(() => {
    if (visible) requestAnimationFrame(refit);
  }, [visible, refit]);

  useEffect(() => {
    if (!active || !visible) return;
    const t = setTimeout(() => {
      if (running || mode === 'classic') termRef.current?.focus();
      else editor.current?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [active, visible, running, mode]);

  // Ticking clock for the running block's elapsed time and relative timestamps.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), running ? 250 : 15000);
    return () => clearInterval(t);
  }, [running]);

  // Keep scrolled to the newest block unless the user scrolled up.
  useEffect(() => {
    const el = scroller.current;
    if (el && stickBottom.current) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [blocks.length, liveRows, running]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const submit = useCallback(
    (text: string, editorMode: EditorMode) => {
      const st = useBlocks.getState().byPane[paneId];
      const cwd = st?.cwd ?? '';
      stickBottom.current = true;
      if (editorMode === 'shell') {
        void run(text);
        return;
      }
      const prompt = text.replace(/^#\s*/, '').trim();
      if (!prompt) return;
      const base = { id: crypto.randomUUID(), cwd, startedAt: Date.now() };
      if (editorMode === 'agent') {
        useBlocks.getState().addBlock(paneId, { ...base, kind: 'agent', goal: prompt, status: 'thinking', steps: [] });
      } else {
        useBlocks.getState().addBlock(paneId, { ...base, kind: 'ai', prompt, status: 'loading' });
      }
    },
    [paneId, run],
  );

  // Block selection (⌘↑ / ⌘↓), find (⌘F), copy (⌘C), Esc.
  const shells = useMemo(() => blocks.filter((b): b is ShellBlock => b.kind === 'shell' && b.exitCode !== null), [blocks]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (running || mode === 'classic') return;
    if (e.metaKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      if (!shells.length) return;
      const idx = selected ? shells.findIndex((b) => b.id === selected) : shells.length;
      const next = e.key === 'ArrowUp' ? Math.max(idx - 1, 0) : idx + 1;
      if (next >= shells.length) {
        setSelected(null);
        editor.current?.focus();
        return;
      }
      setSelected(shells[next].id);
      document.getElementById(`block-${shells[next].id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      root.current?.focus();
    } else if (e.metaKey && e.key === 'f') {
      e.preventDefault();
      setFindOpen(true);
    } else if (e.key === 'Escape' && (selected || findOpen)) {
      setSelected(null);
      setFindOpen(false);
      setFindQuery('');
      editor.current?.focus();
    } else if (e.metaKey && e.key === 'c' && selected && !window.getSelection()?.toString()) {
      const b = shells.find((x) => x.id === selected);
      if (b) {
        e.preventDefault();
        copyText(`$ ${b.command}\n${b.output}`, 'Block copied');
      }
    }
  };

  const filtered = useMemo(() => {
    const q = findQuery.trim().toLowerCase();
    if (!q) return blocks;
    return blocks.filter((b) =>
      b.kind === 'shell'
        ? b.command.toLowerCase().includes(q) || b.output.toLowerCase().includes(q)
        : (b.kind === 'ai' ? b.prompt : b.goal).toLowerCase().includes(q),
    );
  }, [blocks, findQuery]);

  const runningBlock = running ? ([...blocks].reverse().find((b) => b.kind === 'shell' && b.exitCode === null) as ShellBlock | undefined) : undefined;
  const fullscreen = alt || mode === 'classic';
  const liveHeight = fullscreen ? paneH : running ? Math.min(liveRows * cellH + 8, paneH - 44) : 0;

  const renderBlock = (b: Block) => {
    if (b.kind === 'shell') {
      if (b.exitCode === null) return null;
      return (
        <BlockCard
          key={b.id}
          paneId={paneId}
          block={b}
          now={now}
          selected={selected === b.id}
          onSelect={() => setSelected(selected === b.id ? null : b.id)}
          onRerun={() => run(b.command)}
          onAttach={() => useChat.getState().attach(b)}
        />
      );
    }
    if (b.kind === 'ai') return <AiBlockCard key={b.id} paneId={paneId} block={b} onRun={run} />;
    return <AgentBlockCard key={b.id} paneId={paneId} block={b} onRun={run} />;
  };

  // Like a normal terminal: the input sits right under the last block and only pins to the bottom once the pane fills.
  const welcome = mode === 'blocks' && blocks.length === 0 && settings.showWelcome;
  const follow = settings.inputPosition === 'bottom' && mode === 'blocks' && !welcome && !fullscreen;

  const editorEl = (
    <InputEditor
      ref={editor}
      paneId={paneId}
      cwd={pane?.cwd ?? ''}
      gitBranch={pane?.gitBranch ?? null}
      hidden={running || mode !== 'blocks'}
      flush={follow}
      onSubmit={submit}
      onFocus={onFocus}
    />
  );

  return (
    <div
      ref={root}
      tabIndex={-1}
      onMouseDown={onFocus}
      onKeyDown={onKeyDown}
      className={cn('relative flex h-full min-h-0 flex-col bg-background outline-none', settings.inputPosition === 'top' && 'flex-col-reverse')}
    >
      {findOpen && (
        <div className="absolute right-4 top-2 z-30 flex items-center gap-2 rounded-lg border border-border bg-popover px-2 py-1 shadow-md animate-pop-in">
          <Search className="size-3.5 text-muted-foreground" />
          <input
            autoFocus
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (setFindOpen(false), setFindQuery(''), editor.current?.focus())}
            placeholder="Find in blocks…"
            className="w-48 bg-transparent text-app-label outline-none placeholder:text-muted-foreground"
          />
          <span className="text-app-caption text-muted-foreground">{findQuery ? filtered.length : ''}</span>
          <button onClick={() => (setFindOpen(false), setFindQuery(''))} className="text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <div ref={scroller} onScroll={onScroll} className={cn('min-h-0 overflow-y-auto overscroll-contain', follow ? 'flex-initial' : 'flex-1')}>
        {mode === 'blocks' && blocks.length === 0 && <EmptyState paneId={paneId} />}
        {mode === 'boot' && (
          <div className="flex h-full items-center justify-center text-app-label text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Starting shell…
          </div>
        )}
        <div className={cn('flex flex-col', filtered.length > 0 && 'py-2', settings.compactBlocks ? 'gap-0' : 'gap-1.5')}>{filtered.map(renderBlock)}</div>
      </div>

      {/* Running block: header plus the live xterm, clipped to the rows in use. */}
      <div
        className={cn(
          'flex-none overflow-hidden',
          fullscreen ? 'absolute inset-0 z-20 bg-background' : 'border-t border-border/60',
          !running && !fullscreen && 'border-t-0',
        )}
        style={fullscreen ? undefined : { height: running ? liveHeight + 32 : 0 }}
      >
        {running && !fullscreen && runningBlock && (
          <div className="flex h-8 items-center gap-2 px-4 text-app-caption">
            <Loader2 className="size-3.5 animate-spin text-brand" />
            <span className="min-w-0 truncate font-mono text-app-label text-foreground">{runningBlock.command}</span>
            <span className="ml-auto tabular-nums text-muted-foreground">{formatDuration(now - runningBlock.startedAt)}</span>
            <button
              onClick={() => invoke('pty_write', { id: ptyId.current, data: '\x03' })}
              className="flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Interrupt (Ctrl-C)"
            >
              <Square className="size-3" /> Stop
            </button>
          </div>
        )}
        <div className="overflow-hidden px-3" style={{ height: fullscreen ? '100%' : liveHeight }}>
          <div style={{ height: fullscreen ? '100%' : Math.max(paneH - 44, 100) }} className="flex flex-col justify-start">
            <div ref={liveHost} className="h-full w-full" />
          </div>
        </div>
      </div>

      {editorEl}
      {follow && <div className="flex-1" onMouseDown={(e) => (e.preventDefault(), editor.current?.focus())} />}
    </div>
  );
}

export { shellBlocks };
