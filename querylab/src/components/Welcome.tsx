import { Database, Plug, Plus, SquarePen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { endpoint } from "../lib/format";
import { SHORTCUTS } from "../lib/shortcuts";
import type { EngineMeta, Profile } from "../types";
import { EngineMark } from "./EngineMark";
import { Keys } from "./Hint";
import { StateMessage } from "./StateMessage";

interface WelcomeProps {
  engines: EngineMeta[];
  profile: Profile | undefined;
  live: boolean;
  loading: boolean;
  onNewConnection: (engineKind?: string) => void;
  onConnect: (id: string) => void;
  onNewTab: (profileId: string) => void;
}

export function Welcome({ engines, profile, live, loading, onNewConnection, onConnect, onNewTab }: WelcomeProps) {
  if (loading) return <StateMessage title="Loading..." />;
  const engine = profile ? engines.find((candidate) => candidate.kind === profile.engine) : undefined;
  const location = profile ? endpoint(profile) : "";

  return (
    <div className="flex h-full flex-col">
      <div data-tauri-drag-region className="h-9 shrink-0" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="animate-rise-in mx-auto flex w-full max-w-3xl flex-col px-8 pb-12 pt-2">
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/10 text-primary shadow-sm">
              <Database aria-hidden className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight">{profile ? profile.name : "QueryLab"}</h1>
                {profile && <Badge variant={live ? "success" : "outline"}>{live ? "Connected" : "Disconnected"}</Badge>}
              </div>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {profile ? (
                  <>
                    {engine?.displayName ?? profile.engine}
                    {location ? ` · ${location}` : ""}
                  </>
                ) : (
                  "One workbench for 20 databases."
                )}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {profile
                  ? live
                    ? "Open a tab to start querying."
                    : "Connect to browse the schema and run queries."
                  : "Connect, browse the schema, run queries and export results."}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {profile && live && (
              <Button onClick={() => onNewTab(profile.id)}>
                <SquarePen />
                New tab
                <Keys keys={SHORTCUTS.newTab} />
              </Button>
            )}
            {profile && !live && (
              <Button onClick={() => onConnect(profile.id)}>
                <Plug />
                Connect
              </Button>
            )}
            <Button variant={profile ? "outline" : "default"} onClick={() => onNewConnection()}>
              <Plus />
              New connection
            </Button>
          </div>

          <section aria-label="Engines" className="mt-10">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Add a connection</h2>
              <span className="text-[11px] text-muted-foreground/70">{engines.length} engines</span>
            </div>
            <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
              {engines.map((item) => (
                <li key={item.kind}>
                  <button
                    type="button"
                    title={item.summary}
                    onClick={() => onNewConnection(item.kind)}
                    className="group flex w-full items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 text-left shadow-sm transition-[border-color,background-color,box-shadow] hover:border-primary/40 hover:bg-accent/50 hover:shadow-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <EngineMark engine={item} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.displayName}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{item.category}</span>
                    </span>
                    <Plus aria-hidden className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              Commands <Keys keys={SHORTCUTS.palette} />
            </span>
            <span className="flex items-center gap-1.5">
              Switch <Keys keys={SHORTCUTS.switcher} />
            </span>
            <span className="flex items-center gap-1.5">
              Run <Keys keys={SHORTCUTS.run} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
