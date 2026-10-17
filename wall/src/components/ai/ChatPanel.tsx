import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ArrowUp, CornerDownLeft, MessageSquare, Paperclip, Play, Square, Trash2, X } from 'lucide-react';
import { useChat, ChatMessage } from '../../stores/chat';
import { useBlocks, recentCommands } from '../../stores/blocks';
import { activePaneId } from '../../stores/workspace';
import { getPane } from '../../lib/ptyRegistry';
import { Button } from '../ui/button';
import { Hint } from '../ui/tooltip';
import { CommandText } from '../terminal/CommandText';

/** Splits an answer into prose and ``` fenced code. */
function parts(text: string) {
  const out: { code: boolean; text: string }[] = [];
  const re = /```[a-zA-Z]*\n?([\s\S]*?)(```|$)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ code: false, text: text.slice(last, m.index) });
    out.push({ code: true, text: m[1].replace(/\n$/, '') });
    last = m.index + m[0].length;
    if (!m[0]) break;
  }
  if (last < text.length) out.push({ code: false, text: text.slice(last) });
  return out;
}

function Message({ m }: { m: ChatMessage }) {
  if (m.role === 'user') {
    return (
      <div className="ml-8 self-end rounded-xl rounded-br-sm bg-foreground px-3 py-2 text-app-label text-background">{m.content}</div>
    );
  }
  return (
    <div className="space-y-2 text-app-label leading-relaxed text-foreground/90">
      {!m.content && <p className="animate-pulse text-muted-foreground">Thinking…</p>}
      {m.error && <p className="text-destructive">{m.content}</p>}
      {!m.error &&
        parts(m.content).map((p, i) =>
          p.code ? (
            <div key={i} className="group overflow-hidden rounded-lg border border-border bg-background">
              <pre className="overflow-x-auto whitespace-pre-wrap break-all px-3 py-2 font-mono text-app-caption">
                <CommandText text={p.text} />
              </pre>
              <div className="flex justify-end gap-1 border-t border-border/60 bg-card/60 px-1.5 py-1">
                <Hint text="Put in the input editor">
                  <button
                    onClick={() => getPane(activePaneId())?.insert(p.text)}
                    className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-app-caption text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <CornerDownLeft className="size-3" /> Insert
                  </button>
                </Hint>
                <button
                  onClick={() => getPane(activePaneId())?.run(p.text)}
                  className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-app-caption text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Play className="size-3" /> Run
                </button>
              </div>
            </div>
          ) : (
            <p key={i} className="whitespace-pre-wrap">
              {p.text.trim()}
            </p>
          ),
        )}
    </div>
  );
}

export function ChatPanel() {
  const { messages, attachments, setOpen, detach, push, patch, reset } = useChat();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    area.current?.focus();
  }, []);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    const user: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text };
    const reply: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '' };
    const history = [...useChat.getState().messages, user];
    push(user);
    push(reply);
    const requestId = crypto.randomUUID();
    setBusy(requestId);
    let acc = '';
    const off = await listen<{ requestId: string; kind: string; text: string }>('ai://event', (e) => {
      if (e.payload.requestId === requestId && e.payload.kind === 'token') {
        acc += e.payload.text;
        patch(reply.id, { content: acc });
      }
    });
    const pane = activePaneId();
    try {
      const full = await invoke<string>('ai_chat', {
        requestId,
        messages: history.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })),
        context: useChat.getState().attachments.map((a) => a.content).join('\n\n'),
        cwd: useBlocks.getState().byPane[pane]?.cwd || null,
        recent: recentCommands(pane),
      });
      patch(reply.id, { content: full });
    } catch (e) {
      if (String(e) !== 'cancelled') patch(reply.id, { content: String(e), error: true });
      else if (!acc) patch(reply.id, { content: '(stopped)' });
    } finally {
      off();
      setBusy(null);
    }
  };

  return (
    <aside className="flex w-[380px] min-w-[300px] flex-col border-l border-border bg-sidebar animate-rise-in">
      <div className="flex h-10 items-center gap-2 border-b border-border px-3">
        <MessageSquare className="size-4 text-brand" />
        <span className="text-app-label font-medium">AI chat</span>
        <span className="text-app-caption text-muted-foreground">local</span>
        <div className="ml-auto flex items-center gap-0.5">
          <Hint text="New chat">
            <Button variant="ghost" size="icon" className="size-7" onClick={reset}>
              <Trash2 />
            </Button>
          </Hint>
          <Hint text="Close (⌘L)">
            <Button variant="ghost" size="icon" className="size-7" onClick={() => setOpen(false)}>
              <X />
            </Button>
          </Hint>
        </div>
      </div>

      <div ref={list} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="m-auto max-w-[260px] text-center text-app-label text-muted-foreground">
            Ask anything about your shell, errors or scripts. Attach blocks with the
            <MessageSquare className="mx-1 inline size-3.5" />
            button on any block.
          </div>
        )}
        {messages.map((m) => (
          <Message key={m.id} m={m} />
        ))}
      </div>

      <div className="border-t border-border p-3">
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachments.map((a) => (
              <span key={a.id} className="flex max-w-full items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-app-caption">
                <Paperclip className="size-3 text-muted-foreground" />
                <span className="max-w-[220px] truncate font-mono">{a.label}</span>
                <button onClick={() => detach(a.id)} className="text-muted-foreground hover:text-foreground">
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 rounded-xl border border-input bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring/30">
          <textarea
            ref={area}
            value={input}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Ask about your terminal…"
            className="max-h-32 min-h-[22px] flex-1 resize-none bg-transparent text-app-label outline-none placeholder:text-muted-foreground"
          />
          {busy ? (
            <Button size="icon" variant="outline" className="size-7 rounded-lg" onClick={() => invoke('ai_cancel', { requestId: busy })}>
              <Square />
            </Button>
          ) : (
            <Button size="icon" className="size-7 rounded-lg" disabled={!input.trim()} onClick={() => void send()}>
              <ArrowUp />
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}
