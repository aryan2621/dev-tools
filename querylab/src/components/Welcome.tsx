import { Plug, Plus, SquarePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { endpoint } from "../lib/format";
import { SHORTCUTS } from "../lib/shortcuts";
import type { EngineMeta, Profile } from "../types";
import { ConnectionBadge, connectionPhase } from "./ConnectionState";
import { Keys } from "./Hint";
import { StateMessage } from "./StateMessage";

interface WelcomeProps {
  engine: EngineMeta | undefined;
  profile: Profile | undefined;
  live: boolean;
  loading: boolean;
  onNewConnection: () => void;
  onConnect: (id: string) => void;
  onNewTab: (profileId: string) => void;
}

export function Welcome({ engine, profile, live, loading, onNewConnection, onConnect, onNewTab }: WelcomeProps) {
  if (loading) return <StateMessage title="Loading" />;
  const location = profile ? endpoint(profile) : "";

  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <h1 className="truncate text-lg font-semibold">{profile ? profile.name : "No connection"}</h1>
        {profile && <ConnectionBadge phase={connectionPhase(live, false)} />}
      </div>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        {profile
          ? `${engine?.displayName ?? profile.engine}${location ? ` · ${location}` : ""}`
          : "Add a database to browse its schema, run queries and export results."}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
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
        <Button variant={profile ? "outline" : "default"} onClick={onNewConnection}>
          <Plus />
          New connection
        </Button>
      </div>
    </div>
  );
}
