import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PAGE_SIZE } from "../lib/tableView";
import type { TableView } from "../types";
import { IconAction } from "./Hint";

interface TableBarProps {
  view: TableView;
  rows: number;
  disabled: boolean;
  onChange: (view: TableView) => void;
}

export function TableBar({ view, rows, disabled, onChange }: TableBarProps) {
  const [where, setWhere] = useState(view.where);
  useEffect(() => setWhere(view.where), [view.where]);
  const first = view.page * PAGE_SIZE + 1;

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b px-2">
      <span className="truncate text-sm font-medium">{view.object.name}</span>
      <form
        className="flex min-w-0 flex-1 items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          onChange({ ...view, where, page: 0 });
        }}
      >
        <Input aria-label="WHERE filter" placeholder="WHERE  e.g. status = 'active'" value={where} onChange={(event) => setWhere(event.target.value)} className="h-7 max-w-md font-mono text-xs" />
        <Button type="submit" size="sm" variant="outline" disabled={disabled}>
          Filter
        </Button>
      </form>
      <span className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">{rows ? `${first.toLocaleString()}-${(first + rows - 1).toLocaleString()}` : "No rows"}</span>
      <IconAction label="Previous page" disabled={disabled || view.page === 0} onClick={() => onChange({ ...view, page: view.page - 1 })}>
        <ChevronLeft />
      </IconAction>
      <IconAction label="Next page" disabled={disabled || rows < PAGE_SIZE} onClick={() => onChange({ ...view, page: view.page + 1 })}>
        <ChevronRight />
      </IconAction>
    </div>
  );
}
