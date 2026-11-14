import { Check, Eraser, Settings2, Square, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { IconAction } from "@/components/Hint";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { type ChatMessage, type PendingApproval, useAgent } from "./useAgent";

const markdownComponents = {
  p: (props: object) => <p className="my-1.5 first:mt-0 last:mb-0" {...props} />,
  ul: (props: object) => <ul className="my-1.5 list-disc pl-5" {...props} />,
  ol: (props: object) => <ol className="my-1.5 list-decimal pl-5" {...props} />,
  a: (props: object) => <a className="text-primary underline" target="_blank" rel="noreferrer" {...props} />,
  pre: (props: object) => <pre className="my-1.5 max-w-full overflow-x-auto rounded-md border border-border bg-muted p-2 font-mono text-sm" {...props} />,
  code: (props: object) => <code className="font-mono text-sm" {...props} />,
};

function Message({ message }: { message: ChatMessage }) {
  if (message.role === "tool") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check aria-hidden="true" className="size-3.5" />
        {message.text}
      </p>
    );
  }
  if (message.role === "error") {
    return (
      <p role="alert" className="rounded-md border border-destructive/40 bg-destructive-soft px-2 py-1.5 text-sm text-destructive">
        {message.text}
      </p>
    );
  }
  if (message.role === "user") {
    return <p className="ml-6 whitespace-pre-wrap rounded-md bg-primary-soft px-2.5 py-1.5 text-sm">{message.text}</p>;
  }
  return (
    <div className="min-w-0 text-sm leading-relaxed">
      <Markdown components={markdownComponents}>{message.text}</Markdown>
    </div>
  );
}

function ApprovalCard({ pending }: { pending: PendingApproval }) {
  return (
    <section aria-label="Approval needed" className="rounded-md border border-border bg-card p-2.5">
      <h3 className="text-sm font-medium">
        Approve <span className="font-mono text-sm">{pending.call.name}</span>
      </h3>
      <ul className="mt-2 grid gap-1.5">
        {pending.rows.map((row) => (
          <li key={row.field} className="grid gap-0.5 text-sm">
            <span className="text-muted-foreground">{row.field}</span>
            {row.before && <pre className="whitespace-pre-wrap break-all rounded-sm bg-destructive-soft px-1.5 py-0.5 font-mono line-through">{row.before}</pre>}
            <pre className="whitespace-pre-wrap break-all rounded-sm bg-success-soft px-1.5 py-0.5 font-mono">{row.after || "(empty)"}</pre>
          </li>
        ))}
      </ul>
      <div className="mt-2.5 flex gap-1.5">
        <Button size="sm" onClick={() => pending.decide("approve")}>
          Approve
        </Button>
        {pending.call.name !== "run_query" && (
          <Button size="sm" variant="outline" onClick={() => pending.decide("always")}>
            Always allow
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => pending.decide("deny")}>
          Deny
        </Button>
      </div>
    </section>
  );
}

export function AgentPanel({ onSettings }: { onSettings: () => void }) {
  const agent = useAgent();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [agent.messages, agent.pending, agent.live]);

  const submit = () => {
    agent.send(draft);
    setDraft("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const provider = agent.settings?.providers.find((entry) => entry.id === agent.settings?.active);

  return (
    <aside aria-label="AI assistant" className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-sidebar px-3">
        <h2 className="text-sm font-medium">Assistant</h2>
        {provider && <span className="min-w-0 truncate text-xs text-muted-foreground">{provider.model || provider.id}</span>}
        <span className="ml-auto flex items-center">
          <IconAction label="Clear chat" onClick={agent.clear}>
            <Eraser />
          </IconAction>
          <IconAction label="AI settings" onClick={onSettings}>
            <Settings2 />
          </IconAction>
          <IconAction label="Close assistant" onClick={() => agent.setOpen(false)}>
            <X />
          </IconAction>
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {!agent.ready ? (
          <div className="grid gap-2 text-sm text-muted-foreground">
            <p>Connect a model to ask about your schema, explain errors, or draft queries.</p>
            <Button size="sm" className="w-fit" onClick={onSettings}>
              Set up a provider
            </Button>
          </div>
        ) : agent.messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ask about the open query, or describe a query to write.</p>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 break-words">
            {agent.messages.map((message) => (
              <Message key={message.id} message={message} />
            ))}
            {agent.pending && <ApprovalCard pending={agent.pending} />}
            {agent.live && <Message message={{ id: "live", role: "assistant", text: agent.live }} />}
            {agent.busy && !agent.pending && !agent.live && <p className="text-xs text-muted-foreground">Thinking</p>}
          </div>
        )}
        <div ref={endRef} />
      </div>
      <footer className="grid shrink-0 gap-2 border-t border-border p-3">
        <Textarea
          aria-label="Message"
          value={draft}
          rows={3}
          disabled={!agent.ready}
          placeholder="Ask or describe a query"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          className="resize-none"
        />
        <div className="flex justify-end">
          {agent.busy ? (
            <Button size="sm" variant="outline" onClick={agent.stop}>
              <Square aria-hidden="true" className="size-3.5" />
              Stop
            </Button>
          ) : (
            <Button size="sm" disabled={!agent.ready || draft.trim() === ""} onClick={submit}>
              Send
            </Button>
          )}
        </div>
      </footer>
    </aside>
  );
}
