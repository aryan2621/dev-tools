import { Clock, Copy, Download, FileJson, Sparkles } from "lucide-react";
import { Shortcut } from "@/components/Shortcut";
import { modSymbol } from "@/platform";
import { useState } from "react";
import { commands } from "@/commands";
import { CodeEditor } from "@/components/CodeEditor";
import { CountTrigger } from "@/components/CountTrigger";
import { IconAction } from "@/components/IconAction";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAgent } from "./ai/useAgent";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { attempt, copyWithToast } from "@/notify";
import type { ApiResponse } from "@/types";

type View = "pretty" | "raw";

interface ResponsePaneProps {
  requestId: string;
  response: ApiResponse | undefined;
  sending: boolean;
}

export const statusVariant = (status: number): BadgeProps["variant"] => {
  if (status >= 500 || status === 0) return "destructive";
  if (status >= 400) return "warning";
  if (status >= 200 && status < 300) return "success";
  return "info";
};

const LARGE_BODY = 1_000_000;

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export const formatDuration = (ms: number) =>
  ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;

function PairList({
  rows,
  empty,
}: {
  rows: { name: string; value: string; detail?: string }[];
  empty: string;
}) {
  if (rows.length === 0)
    return <p className="p-3 text-sm text-muted-foreground">{empty}</p>;
  return (
    <dl className="grid select-text grid-cols-[minmax(120px,max-content)_1fr] gap-x-4 gap-y-1 p-3 font-mono text-sm">
      {rows.map((row, index) => (
        <div key={`${row.name}-${index}`} className="contents">
          <dt className="text-muted-foreground">{row.name}</dt>
          <dd className="m-0 break-all text-foreground">
            {row.value}
            {row.detail && (
              <span className="block text-muted-foreground">{row.detail}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Message({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Empty className="items-center text-center">
      <EmptyMedia>
        <FileJson />
      </EmptyMedia>
      <EmptyHeader className="items-center">
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function PendingResponse() {
  return (
    <div
      role="status"
      aria-label="Sending request"
      className="flex h-full flex-col items-center justify-center gap-4 p-6"
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <span
          aria-hidden="true"
          className="size-2 animate-pulse-dot rounded-full bg-primary"
        />
        Sending request
      </div>
      <div className="w-72 space-y-1.5" aria-hidden="true">
        <Skeleton className="h-3" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
      <span className="sr-only">Waiting for the server to respond.</span>
    </div>
  );
}

const MIME_EXTENSIONS: Record<string, string> = {
  "application/json": "json",
  "application/xml": "xml",
  "text/xml": "xml",
  "text/html": "html",
  "text/plain": "txt",
  "text/css": "css",
  "text/csv": "csv",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
};

function responseFileName(response: ApiResponse) {
  const segment =
    response.resolvedUrl.split(/[?#]/)[0].split("/").filter(Boolean).pop() ??
    "response";
  const base = segment.replace(/\.[a-z0-9]{1,5}$/i, "") || "response";
  const extension =
    MIME_EXTENSIONS[(response.mimeType ?? "").split(";")[0].trim()] ?? "bin";
  return `${base}.${extension}`;
}

export function ResponsePane({
  requestId,
  response,
  sending,
}: ResponsePaneProps) {
  const [view, setView] = useState<View>("pretty");
  const [section, setSection] = useState("body");
  const agent = useAgent();

  if (sending) return <PendingResponse />;
  if (!response)
    return (
      <p className="flex items-center gap-1.5 px-4 py-3 text-sm text-muted-foreground">
        Press <Shortcut keys={[modSymbol, "↵"]} /> to send. The response appears
        here.
      </p>
    );
  if (response.error)
    return (
      <div className="grid justify-items-start gap-2 p-3">
        <Alert variant="destructive" role="alert">
          Request failed: {response.error}
        </Alert>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            agent.ask(
              "The open request failed to send. Look at the request and the error, and tell me what is wrong and how to fix it.",
            )
          }
        >
          <Sparkles aria-hidden="true" />
          Debug error
        </Button>
      </div>
    );

  const text =
    view === "pretty" ? (response.prettyBody ?? response.body) : response.body;

  return (
    <section aria-label="Response" className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3 text-sm text-muted-foreground">
        <Badge
          variant={statusVariant(response.status)}
          className="gap-1.5 font-semibold"
        >
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full bg-current"
          />
          {response.status} {response.statusText}
        </Badge>
        <span aria-hidden="true" className="text-border">
          ·
        </span>
        <span className="flex items-center gap-1 font-mono tabular-nums">
          <Clock aria-hidden="true" className="size-3.5 opacity-70" />
          {formatDuration(response.durationMs)}
        </span>
        <span className="font-mono tabular-nums">
          {formatSize(response.size)}
        </span>
        {response.mimeType && (
          <Badge variant="outline" title={response.mimeType} className="min-w-0 truncate">
            {response.mimeType}
          </Badge>
        )}
        <span className="ml-auto flex items-center gap-0.5">
          {response.status >= 400 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                agent.ask(
                  "Debug the open request's response: why did it fail and what should I change?",
                )
              }
            >
              <Sparkles aria-hidden="true" />
              Debug
            </Button>
          )}
          <IconAction
            icon={Copy}
            label="Copy body"
            onClick={() => copyWithToast(text, "Body copied")}
          />
          <IconAction
            icon={Download}
            label="Save body to file"
            onClick={() =>
              attempt(
                () =>
                  commands.saveResponse(requestId, responseFileName(response)),
                "Response saved",
                "Could not save response",
              )
            }
          />
        </span>
      </div>
      <Tabs
        value={section}
        onValueChange={setSection}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border pr-2">
          <TabsList aria-label="Response sections" className="px-3">
            <CountTrigger value="body" label="Body" />
            <CountTrigger
              value="headers"
              label="Headers"
              count={response.headers.length}
            />
            <CountTrigger
              value="cookies"
              label="Cookies"
              count={response.cookies.length}
            />
          </TabsList>
          {!response.binary && section === "body" && (
            <div className="flex items-center gap-2">
              {text.length >= LARGE_BODY && (
                <span className="text-xs text-muted-foreground">
                  Large body, line wrap off
                </span>
              )}
              <ToggleGroup
                type="single"
                size="sm"
                aria-label="Body view"
                value={view}
                onValueChange={(next) => next && setView(next as View)}
              >
                <ToggleGroupItem value="pretty">Pretty</ToggleGroupItem>
                <ToggleGroupItem value="raw">Raw</ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}
        </div>
        <TabsContent
          value="body"
          className="mt-0 min-h-0 flex-1 overflow-auto bg-sidebar"
        >
          {response.imageDataUrl ? (
            <img
              src={response.imageDataUrl}
              alt="Response preview"
              className="m-3 max-w-full"
            />
          ) : response.binary ? (
            <Message
              title="Binary response"
              description="Use Save to write it to a file."
            />
          ) : (
            <CodeEditor
              label="Response body"
              language={
                view === "pretty" && response.prettyBody ? "json" : "plain"
              }
              wrap={text.length < LARGE_BODY}
              value={text}
            />
          )}
        </TabsContent>
        <TabsContent
          value="headers"
          className="mt-0 min-h-0 flex-1 overflow-auto"
        >
          <PairList rows={response.headers} empty="No headers." />
        </TabsContent>
        <TabsContent
          value="cookies"
          className="mt-0 min-h-0 flex-1 overflow-auto"
        >
          <PairList rows={response.cookies} empty="No cookies." />
        </TabsContent>
      </Tabs>
    </section>
  );
}
