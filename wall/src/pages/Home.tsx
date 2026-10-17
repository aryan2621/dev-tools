import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ArrowRight, Flame } from 'lucide-react';
import { formatDuration } from '../lib/format';
import { Button } from '../components/ui/button';
import { CommandText } from '../components/terminal/CommandText';
import { CommandRow, HistoryRow } from '../components/CommandRow';
import { EmptyState, PageHeader, Panel, SectionTitle } from '../components/bits';

type Stats = {
  total: number;
  today: number;
  successRate: number;
  avgDurationMs: number;
  aiAccepted: number;
  streakDays: number;
  daily: { day: string; total: number; failed: number }[];
  top: { command: string; count: number }[];
};

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** The week's commands as a soft area line, like Murmur's words sparkline. */
function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? 300 / (values.length - 1) : 300;
  const pts = values.map((v, i) => [i * step, 76 - (v / max) * 68] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox="0 0 300 80" preserveAspectRatio="none" className="h-20 w-full overflow-visible">
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--brand))" stopOpacity={0.35} />
          <stop offset="100%" stopColor="hsl(var(--brand))" stopOpacity={0} />
        </linearGradient>
      </defs>
      {pts.length > 0 && <path d={`${line} L300 80 L0 80 Z`} fill="url(#spark-fill)" />}
      <path d={line} fill="none" stroke="hsl(var(--brand))" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const weekday = (day: string) => new Date(`${day}T00:00`).toLocaleDateString([], { weekday: 'short' });

/** Home: today's commands, the streak, what you run most and what you ran last. */
export function Home({ goTo }: { goTo: (page: 'history') => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<HistoryRow[] | null>(null);

  useEffect(() => {
    invoke<Stats>('history_stats').then(setStats).catch(() => {});
    invoke<HistoryRow[]>('history_search', { query: '', failedOnly: false, limit: 5 }).then(setRecent).catch(() => setRecent([]));
  }, []);

  const week = useMemo(() => (stats?.daily ?? []).slice(-7), [stats]);
  const today = stats?.today ?? 0;
  const earlier = week.slice(0, -1);
  const avg = earlier.length ? earlier.reduce((s, d) => s + d.total, 0) / earlier.length : 0;
  const topMax = stats?.top[0]?.count ?? 1;
  const date = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <>
      <PageHeader eyebrow={date} title={<>{greeting()}<span className="text-muted-foreground/60">.</span></>} />

      {/* Hero: today's commands with a 7-day sparkline, and the streak. */}
      <div className="grid grid-cols-[1.65fr_1fr] gap-4">
        <div className="relative overflow-hidden rounded-2xl bg-lavender p-6 text-lavender-foreground">
          <div className="text-xs font-medium uppercase tracking-wide opacity-70">Today</div>
          <div className="mt-2 font-display text-[76px] font-medium leading-[0.85] tracking-[-0.03em] tabular-nums">{today.toLocaleString()}</div>
          <div className="mt-2 text-sm opacity-80">
            commands run
            {avg > 0 && <span className="opacity-80"> · {today >= avg ? 'above' : 'below'} your {Math.round(avg)}/day average</span>}
          </div>
          <div className="mt-4">
            <Sparkline values={week.map((d) => d.total)} />
            <div className="mt-1 flex justify-between text-[10px] opacity-60">
              {week.map((d) => (
                <span key={d.day}>{weekday(d.day)}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl bg-forest p-6 text-forest-foreground">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide opacity-75">
            <Flame className="size-3.5" /> Streak
          </div>
          <div>
            <div className="font-display text-[64px] font-medium leading-[0.85] tracking-[-0.03em] tabular-nums">{stats?.streakDays ?? 0}</div>
            <div className="mt-1.5 text-sm opacity-80">{stats?.streakDays === 1 ? 'day' : 'days'} in a row</div>
          </div>
          <div className="border-t border-white/15 pt-3 text-xs">
            <span className="font-display text-2xl font-medium leading-none">{stats ? `${Math.round(stats.successRate * 100)}%` : '–'}</span>
            <span className="ml-2 opacity-70">succeeded</span>
          </div>
        </div>
      </div>

      <Panel className="mt-4 grid grid-cols-3 divide-x">
        {[
          ['All time', (stats?.total ?? 0).toLocaleString(), 'commands'],
          ['Average run', formatDuration(stats?.avgDurationMs ?? 0), 'per command'],
          ['From AI', String(stats?.aiAccepted ?? 0), 'commands accepted'],
        ].map(([label, value, hint]) => (
          <div key={label} className="px-5 py-4">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 font-display text-[28px] font-medium leading-none tabular-nums">{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
          </div>
        ))}
      </Panel>

      <SectionTitle>Most used</SectionTitle>
      <Panel className="overflow-hidden">
        {stats?.top.length ? (
          <div className="space-y-1 p-3">
            {stats.top.slice(0, 6).map((t) => (
              <div key={t.command} className="relative flex items-center gap-2 overflow-hidden rounded-lg px-3 py-1.5">
                <div className="absolute inset-y-0 left-0 rounded-lg bg-accent" style={{ width: `${(t.count / topMax) * 100}%` }} />
                <span className="relative min-w-0 flex-1 truncate font-mono text-[13px]">
                  <CommandText text={t.command} />
                </span>
                <span className="relative text-xs tabular-nums text-muted-foreground">{t.count}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Nothing yet">Run a few commands in Wall to see them here.</EmptyState>
        )}
      </Panel>

      <SectionTitle
        action={
          <Button variant="ghost" size="sm" className="-mr-2 text-muted-foreground" onClick={() => goTo('history')}>
            View all <ArrowRight />
          </Button>
        }
      >
        Recent
      </SectionTitle>
      <Panel className="overflow-hidden">
        {recent === null ? null : recent.length ? (
          recent.map((r) => <CommandRow key={r.id} row={r} />)
        ) : (
          <EmptyState title="Nothing yet">Commands you run in Wall show up here.</EmptyState>
        )}
      </Panel>
    </>
  );
}
