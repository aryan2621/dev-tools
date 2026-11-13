import { Activity, BarChart3, Cloud, Database, FileJson, HardDrive, KeyRound, Layers, Search, Share2, Table2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EngineMeta } from "../types";

interface EngineVisual {
  icon: LucideIcon;
  className: string;
}

const DEFAULT_VISUAL: EngineVisual = {
  icon: Database,
  className: "border-primary/15 bg-primary/10 text-primary",
};

const BY_KIND: Record<string, EngineVisual> = {
  sqlite: { icon: HardDrive, className: "border-primary/15 bg-primary/10 text-primary" },
  mongodb: { icon: FileJson, className: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  redis: { icon: KeyRound, className: "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400" },
};

const BY_CATEGORY: Record<string, EngineVisual> = {
  Relational: { icon: Table2, className: "border-primary/15 bg-primary/10 text-primary" },
  "Cloud Managed": { icon: Cloud, className: "border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  Document: { icon: FileJson, className: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  "Key-Value": { icon: KeyRound, className: "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  "Wide-Column": { icon: Layers, className: "border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  Search: { icon: Search, className: "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  "Analytics / OLAP": { icon: BarChart3, className: "border-indigo-500/20 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" },
  "Time Series": { icon: Activity, className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  Graph: { icon: Share2, className: "border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400" },
};

export function engineVisual(engine: EngineMeta | undefined): EngineVisual {
  if (!engine) return DEFAULT_VISUAL;
  return BY_KIND[engine.kind] ?? BY_CATEGORY[engine.category] ?? DEFAULT_VISUAL;
}

export function EngineMark({ engine, className }: { engine: EngineMeta | undefined; className?: string }) {
  const visual = engineVisual(engine);
  const Icon = visual.icon;
  return (
    <span aria-hidden className={cn("grid size-6 shrink-0 place-items-center rounded-md border", visual.className, className)}>
      <Icon className="size-3.5" />
    </span>
  );
}
