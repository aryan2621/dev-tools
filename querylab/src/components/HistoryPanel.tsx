import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "../api";
import { attempt } from "../lib/notify";
import { firstLine, formatTime, searchHistory } from "../lib/format";
import type { HistoryEntry } from "../types";
import { IconAction } from "./Hint";
import { StateMessage } from "./StateMessage";

interface HistoryPanelProps {
  profileId: string | null;
  refreshKey: string | null;
  onPick: (entry: HistoryEntry) => void;
}

export function HistoryPanel({ profileId, refreshKey, onPick }: HistoryPanelProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!profileId) {
      setEntries([]);
      return;
    }
    api<HistoryEntry[]>("history_list", { id: profileId }).then((loaded) => setEntries(loaded));
  }, [profileId, refreshKey]);

  const visible = useMemo(() => searchHistory(entries, filter), [entries, filter]);

  const clear = async () => {
    if (profileId && (await attempt(() => api("history_clear", { id: profileId }), undefined, "Could not clear history")) !== undefined) setEntries([]);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-end gap-1.5 border-b p-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Label htmlFor="history-filter" className="text-xs text-muted-foreground">
            Search history
          </Label>
          <Input id="history-filter" value={filter} onChange={(event) => setFilter(event.target.value)} autoComplete="off" />
        </div>
        <IconAction label="Clear history" disabled={entries.length === 0} onClick={clear}>
          <Trash2 />
        </IconAction>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!profileId && <StateMessage title="No connection selected" hint="Select a connection to see its history." />}
        {profileId && visible.length === 0 && <StateMessage title={entries.length === 0 ? "No queries run yet" : "No matches"} />}
        {visible.map((entry) => (
          <button key={`${entry.at}-${entry.input}`} type="button" onClick={() => onPick(entry)} className="flex w-full flex-col gap-0.5 border-b px-3 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            <span className="truncate font-mono text-xs">{firstLine(entry.input, 80)}</span>
            <span className="flex gap-2 text-xs text-muted-foreground">
              {formatTime(entry.at)}
              {!entry.ok && <span className="font-medium text-destructive">failed</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
