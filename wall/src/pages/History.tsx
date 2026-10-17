import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Search } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { CommandRow, HistoryRow } from '../components/CommandRow';
import { EmptyState, PageHeader, Panel } from '../components/bits';

/** Every command run in Wall, searchable by command or folder. */
export function History() {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [failedOnly, setFailedOnly] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      invoke<HistoryRow[]>('history_search', { query, failedOnly, limit: 300 }).then(setRows).catch(() => setRows([]));
    }, 120);
    return () => clearTimeout(t);
  }, [query, failedOnly]);

  return (
    <>
      <PageHeader title="History" description="Everything you ran in Wall, kept on this Mac." />
      <div className="mb-3 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search commands or folders" className="pl-9" />
        </div>
        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Switch checked={failedOnly} onCheckedChange={setFailedOnly} /> Failed only
        </label>
      </div>
      <Panel className="overflow-hidden">
        {rows === null ? null : rows.length ? (
          rows.map((r) => <CommandRow key={r.id} row={r} />)
        ) : (
          <EmptyState title={query || failedOnly ? 'No matches' : 'Nothing yet'}>
            {query || failedOnly ? 'Try a different search.' : 'Commands you run in Wall show up here.'}
          </EmptyState>
        )}
      </Panel>
    </>
  );
}
