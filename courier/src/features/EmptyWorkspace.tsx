import { Plus, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { commands } from "@/commands";
import { MethodBadge } from "@/components/MethodBadge";
import { Shortcut } from "@/components/Shortcut";
import { Button } from "@/components/ui/button";
import { attempt } from "@/notify";
import { modSymbol } from "@/platform";
import { useCourier } from "@/store";
import type { HistoryEntry } from "@/types";
import { formatDuration } from "./ResponsePane";

interface EmptyWorkspaceProps {
  onImport: () => void;
}

export function EmptyWorkspace({ onImport }: EmptyWorkspaceProps) {
  const { startRequest, openHistory } = useCourier();
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    attempt(commands.listHistory, undefined, "Could not load history").then((loaded) => setHistory(loaded ?? []));
  }, []);

  return (
    <div className="flex min-h-0 flex-1 overflow-y-auto">
      <div className="m-auto w-full max-w-xl px-8 py-8 text-center">
        <h1 className="text-lg font-semibold">No request open</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Pick a request from the sidebar, start a new one, or paste a cURL command.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button onClick={startRequest}>
            <Plus aria-hidden="true" />
            New request
            <Shortcut keys={[modSymbol, "N"]} />
          </Button>
          <Button variant="outline" onClick={onImport}>
            <Upload aria-hidden="true" />
            Import cURL
          </Button>
        </div>
        {history.length > 0 && (
          <section aria-labelledby="recent-heading" className="mt-8 text-left">
            <h2 id="recent-heading" className="mb-1 text-sm font-medium text-muted-foreground">
              Recent
            </h2>
            <ul className="m-0 list-none divide-y divide-border border-y border-border p-0">
              {history.slice(0, 6).map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => openHistory(entry)}
                    className="flex w-full items-center gap-2 px-1 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <MethodBadge method={entry.request.method} />
                    <span title={entry.request.url} className="min-w-0 flex-1 truncate font-mono text-sm">{entry.request.url}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {entry.status || "Failed"} · {formatDuration(entry.durationMs)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
