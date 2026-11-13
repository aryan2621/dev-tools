import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ConnectionPhase = "connected" | "connecting" | "disconnected";

const PHASES: Record<ConnectionPhase, { label: string; dot: string; variant: "success" | "warning" | "outline" }> = {
  connected: { label: "Connected", dot: "bg-success", variant: "success" },
  connecting: { label: "Connecting...", dot: "animate-pulse bg-warning", variant: "warning" },
  disconnected: { label: "Disconnected", dot: "border border-muted-foreground", variant: "outline" },
};

export const connectionPhase = (live: boolean, busy: boolean): ConnectionPhase => (live ? "connected" : busy ? "connecting" : "disconnected");

export const phaseLabel = (phase: ConnectionPhase) => PHASES[phase].label;

export function PhaseDot({ phase, className }: { phase: ConnectionPhase; className?: string }) {
  return <span aria-hidden className={cn("size-2 shrink-0 rounded-full", PHASES[phase].dot, className)} />;
}

export function ConnectionBadge({ phase }: { phase: ConnectionPhase }) {
  return (
    <Badge variant={PHASES[phase].variant}>
      <PhaseDot phase={phase} />
      {PHASES[phase].label}
    </Badge>
  );
}
