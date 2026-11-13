import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { commands } from "@/commands";
import { MethodBadge } from "@/components/MethodBadge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { attempt } from "@/notify";
import { useCourier } from "@/store";
import type { HistoryEntry } from "@/types";

const formatDate = (millis: number) =>
  new Date(millis).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

const formatDuration = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`);

export function HistoryPanel() {
  const { openHistory } = useCourier();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    attempt(commands.listHistory, undefined, "Could not load history").then((loaded) => setEntries(loaded ?? []));
  }, []);

  const clear = async () => {
    await attempt(commands.clearHistory, "History cleared", "Could not clear history");
    setEntries([]);
  };

  if (entries === null) return null;

  if (entries.length === 0) {
    return (
      <Empty className="justify-start px-4 pt-10">
        <EmptyHeader>
          <EmptyTitle>No history yet</EmptyTitle>
          <EmptyDescription>Requests you send appear here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <ul className="m-0 list-none p-0 pb-3">
          {entries.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => openHistory(entry)}
                className="flex w-full flex-col gap-0.5 px-3 py-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <MethodBadge method={entry.request.method} />
                  <span className="truncate font-mono text-sm">{entry.request.url}</span>
                </span>
                <span className="flex gap-2 text-xs tabular-nums text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span aria-hidden="true" className={cn("size-1.5 rounded-full", entry.status >= 400 || entry.status === 0 ? "bg-destructive" : entry.status >= 300 ? "bg-warning" : "bg-success")} />
                    <span className="font-medium text-foreground">{entry.status || "Failed"}</span>
                  </span>
                  <span>{formatDuration(entry.durationMs)}</span>
                  <span className="ml-auto">{formatDate(entry.date)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </ScrollArea>
      <div className="shrink-0 border-t border-border p-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="w-full">
              <Trash2 aria-hidden="true" />
              Clear history
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear history</AlertDialogTitle>
              <AlertDialogDescription>Remove all {entries.length} sent requests from history? This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={clear}>Clear</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}
