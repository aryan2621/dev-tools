import { Clock, Database, Table2, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { IconAction } from "./Hint";

export type Panel = "connections" | "schema" | "history";

const PANELS: { id: Panel; label: string; icon: LucideIcon }[] = [
  { id: "connections", label: "Connections", icon: Database },
  { id: "schema", label: "Schema", icon: Table2 },
  { id: "history", label: "History", icon: Clock },
];

interface RailProps {
  panel: Panel;
  onPanel: (panel: Panel) => void;
  children?: ReactNode;
}

export function Rail({ panel, onPanel, children }: RailProps) {
  return (
    <nav aria-label="Workspace" className="flex w-12 shrink-0 flex-col items-center gap-1 border-r bg-sidebar py-2 pt-10">
      {PANELS.map(({ id, label, icon: Icon }) => (
        <IconAction key={id} label={label} aria-pressed={panel === id} className={cn(panel === id && "bg-accent text-foreground")} onClick={() => onPanel(id)}>
          <Icon />
        </IconAction>
      ))}
      <div className="mt-auto flex flex-col items-center gap-1">{children}</div>
    </nav>
  );
}
