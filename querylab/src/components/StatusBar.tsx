import { Loader2 } from "lucide-react";
import { SHORTCUTS } from "../lib/shortcuts";
import { endpoint } from "../lib/format";
import type { EngineMeta, Profile } from "../types";
import { ConnectionBadge, type ConnectionPhase } from "./ConnectionState";
import { Keys } from "./Hint";

interface StatusBarProps {
  profile: Profile | undefined;
  engine: EngineMeta | undefined;
  phase: ConnectionPhase;
  running: boolean;
}

export function StatusBar({ profile, engine, phase, running }: StatusBarProps) {
  return (
    <footer className="flex h-7 shrink-0 items-center gap-2 border-t bg-sidebar px-2.5 text-[11px] text-muted-foreground">
      {profile ? (
        <>
          <ConnectionBadge phase={phase} />
          {engine && <span className="font-medium text-foreground/80">{engine.displayName}</span>}
          <span aria-hidden className="text-[10px] text-muted-foreground/50">
            ·
          </span>
          <span className="min-w-0 truncate font-mono text-[10px]">{endpoint(profile) || "No endpoint"}</span>
          {running && (
            <>
              <span aria-hidden className="mx-0.5 h-3 w-px bg-border" />
              <span role="status" className="flex items-center gap-1 text-foreground/80">
                <Loader2 aria-hidden className="size-3 animate-spin text-primary" />
                Running query
              </span>
            </>
          )}
        </>
      ) : (
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-1.5 rounded-full border border-muted-foreground" />
          No connection selected
        </span>
      )}
      <span className="ml-auto flex items-center gap-1">
        <span className="hidden items-center gap-1 sm:flex">
          Commands <Keys keys={SHORTCUTS.palette} />
        </span>
        <span className="ml-2 hidden items-center gap-1 md:flex">
          Switch <Keys keys={SHORTCUTS.switcher} />
        </span>
      </span>
    </footer>
  );
}
