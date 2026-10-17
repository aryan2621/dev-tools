import { Download, Loader2, CircleCheck, TriangleAlert } from 'lucide-react';
import { useLlm } from '../stores/llm';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { useSettings } from '../stores/settings';
import { cn } from '../lib/utils';

function gb(mb: number) {
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${mb} MB`;
}

/** Status dot for the status bar: green when a model is loaded, amber when installed, red when none. */
export function LlmStatus({ onClick }: { onClick: () => void }) {
  const catalog = useLlm((s) => s.catalog);
  const color = !catalog
    ? 'bg-muted-foreground/40'
    : catalog.running
      ? 'bg-success'
      : catalog.active
        ? 'bg-warning'
        : 'bg-destructive';
  const label = !catalog
    ? 'AI'
    : catalog.running
      ? `AI · ${catalog.running}`
      : catalog.active
        ? `AI · ${catalog.active} (idle)`
        : 'AI · no model';
  return (
    <button onClick={onClick} className="ml-auto flex items-center gap-2 transition-colors duration-fast hover:text-foreground">
      <span className={cn('size-2 rounded-full', color)} />
      {label}
    </button>
  );
}

/** The model catalog with download / cancel / use controls. Used by Settings › AI. */
export function ModelList() {
  const { catalog, error, download, cancel, refresh } = useLlm();
  const preferred = useSettings((s) => s.model);
  const setSetting = useSettings((s) => s.set);
  const dl = catalog?.download;
  const downloading = dl && !dl.finished && !dl.error ? dl : null;

  return (
    <div className="grid gap-2">
      {!catalog && <p className="text-app-label text-muted-foreground">Loading…</p>}
      {catalog && !catalog.runtimeAvailable && (
        <p className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-2 text-app-caption text-destructive">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          The bundled llama-server was not found. Run scripts/build-llama-server.sh or set LLAMA_SERVER_PATH.
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-destructive/20 bg-destructive/10 p-2 text-app-caption text-destructive">{error}</p>
      )}
      {catalog?.models.map((m) => {
        const busy = downloading?.id === m.id;
        const pct = busy && downloading!.total ? Math.round((downloading!.done / downloading!.total) * 100) : 0;
        const tooBig = m.minRamGb > catalog.ramGb;
        const active = m.id === catalog.active;
        return (
          <div key={m.id} className={cn('rounded-lg border bg-surface p-3', active ? 'border-brand/40' : 'border-border')}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-app-label text-foreground">
                  {m.name}
                  {m.id === catalog.recommended && <Badge variant="success">recommended</Badge>}
                  {active && <Badge variant="brand">active</Badge>}
                  {catalog.running === m.id && <Badge variant="outline">loaded</Badge>}
                </div>
                <div className="text-app-caption text-muted-foreground">
                  {gb(m.sizeMb)} · needs {m.minRamGb} GB RAM{tooBig ? ' (more than this Mac has)' : ''}
                </div>
              </div>
              {m.installed ? (
                active ? (
                  <span className="flex items-center gap-1 text-app-caption text-muted-foreground">
                    <CircleCheck className="size-3.5 text-success" /> in use
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      setSetting('model', m.id);
                      setTimeout(refresh, 100);
                    }}
                  >
                    Use
                  </Button>
                )
              ) : busy ? (
                <Button size="sm" variant="outline" onClick={cancel}>
                  <Loader2 className="animate-spin" />
                  Cancel {pct}%
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled={!!downloading} onClick={() => download(m.id)}>
                  <Download />
                  Download
                </Button>
              )}
            </div>
            <p className="mt-1 text-app-caption text-muted-foreground">{m.note}</p>
            {busy && (
              <div className="mt-2 h-1 overflow-hidden rounded bg-muted">
                <div className="h-full bg-brand transition-all" style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
        );
      })}
      {preferred && catalog && catalog.active !== preferred && (
        <p className="text-app-caption text-muted-foreground">The chosen model isn't installed; using {catalog.active ?? 'none'}.</p>
      )}
      {dl?.error && <p className="text-app-caption text-destructive">Download failed: {dl.error}</p>}
    </div>
  );
}
