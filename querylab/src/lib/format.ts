import type { Profile } from "../types";

export function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

export function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function firstLine(text: string, max = 64): string {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > max ? `${line.slice(0, max)}...` : line;
}

export function endpoint(profile: Profile): string {
  return [profile.host, profile.database].filter(Boolean).join(" / ") || profile.filePath || profile.uri;
}
