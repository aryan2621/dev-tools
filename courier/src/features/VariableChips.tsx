import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { KV } from "@/types";

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_.\-]+)\s*\}\}/g;

const namesIn = (text: string) => [...new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[1]))];

const valueOf = (variables: KV[], name: string) =>
  [...variables].reverse().find((variable) => variable.enabled && variable.key === name)?.value;

export function VariableChips({ text, variables }: { text: string; variables: KV[] }) {
  const names = namesIn(text);
  if (names.length === 0) return null;
  return (
    <ul aria-label="Variables used" className="m-0 flex list-none flex-wrap items-center gap-1 p-0">
      {names.map((name) => {
        const value = valueOf(variables, name);
        return (
          <li key={name}>
            <HoverCard openDelay={150}>
              <HoverCardTrigger asChild>
                <button type="button" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Badge variant={value === undefined ? "warning" : "info"}>{name}</Badge>
                </button>
              </HoverCardTrigger>
              <HoverCardContent className="w-64 text-sm">
                <p className="font-mono text-muted-foreground">{`{{${name}}}`}</p>
                <p className="mt-1 select-text break-all font-mono">{value === undefined ? "Not defined" : value || "Empty"}</p>
              </HoverCardContent>
            </HoverCard>
          </li>
        );
      })}
    </ul>
  );
}
