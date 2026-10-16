'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AuditEntry } from '@/lib/audit/audit-log';
import type { IntegrityReport } from '@/lib/audit/audit-checkpoint';

interface Filters {
  actor: string;
  action: string;
  target: string;
  since: string;
  until: string;
}

interface AuditResponse {
  orgId: string;
  items: AuditEntry[];
  nextCursor: string | null;
  integrity: IntegrityReport;
}

const EMPTY: Filters = { actor: '', action: '', target: '', since: '', until: '' };

const INPUT = 'mt-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950';
const LABEL = 'block text-xs font-semibold text-zinc-600 dark:text-zinc-400';

function toQuery(filters: Filters, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(extra);
  for (const [key, value] of Object.entries(filters)) {
    if (!value) continue;
    // Date inputs are whole days; `until` includes the whole of its day.
    params.set(key, key === 'until' ? `${value}T23:59:59.999Z` : value);
  }
  return params.toString();
}

type FetchResult = { data: AuditResponse } | { error: string };

async function fetchAuditPage(filters: Filters, cursor?: string): Promise<FetchResult> {
  const response = await fetch(`/api/audit?${toQuery(filters, cursor ? { cursor } : {})}`, { cache: 'no-store' });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.data) return { error: body?.error ?? `Request failed (${response.status})` };
  return { data: body.data as AuditResponse };
}

function IntegrityBanner({ integrity }: { integrity: IntegrityReport }) {
  if (integrity.status === 'broken') {
    return (
      <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        <strong>Tampering detected at entry {integrity.brokenAt}.</strong> {integrity.reason}
      </p>
    );
  }
  const anchored = integrity.checkpoint === 'verified';
  return (
    <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
      {integrity.status === 'empty' ? 'No entries yet.' : 'Hash chain verified.'}{' '}
      {anchored
        ? `Signed checkpoint at entry ${integrity.checkpointSequence} matches.`
        : integrity.checkpoint === 'missing'
          ? 'No signed checkpoint yet — truncation cannot be ruled out.'
          : `Checkpoint ${integrity.checkpoint.replace('_', ' ')}.`}
    </p>
  );
}

export default function AuditExplorer() {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [data, setData] = useState<AuditResponse | null>(null);
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const apply = useCallback((result: FetchResult, append: boolean) => {
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setError(null);
    setData(result.data);
    setItems((previous) => (append ? [...previous, ...result.data.items] : result.data.items));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchAuditPage(applied).then((result) => {
      if (!cancelled) apply(result, false);
    });
    return () => {
      cancelled = true;
    };
  }, [applied, apply]);

  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {data && <IntegrityBanner integrity={data.integrity} />}

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied(filters);
        }}
      >
        {(['actor', 'action', 'target'] as const).map((field) => (
          <div key={field}>
            <label htmlFor={`audit-${field}`} className={`${LABEL} capitalize`}>
              {field}
            </label>
            <input
              id={`audit-${field}`}
              value={filters[field]}
              onChange={(event) => setFilters({ ...filters, [field]: event.target.value })}
              className={INPUT}
            />
          </div>
        ))}
        {(['since', 'until'] as const).map((field) => (
          <div key={field}>
            <label htmlFor={`audit-${field}`} className={`${LABEL} capitalize`}>
              {field}
            </label>
            <input
              id={`audit-${field}`}
              type="date"
              value={filters[field]}
              onChange={(event) => setFilters({ ...filters, [field]: event.target.value })}
              className={INPUT}
            />
          </div>
        ))}
        <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
          Apply
        </button>
        {(['csv', 'json'] as const).map((format) => (
          <a
            key={format}
            href={`/api/audit/export?${toQuery(applied, { format })}`}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold dark:border-zinc-700"
          >
            Export {format.toUpperCase()}
          </a>
        ))}
      </form>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th scope="col" className="px-4 py-3">#</th>
              <th scope="col" className="px-4 py-3">When</th>
              <th scope="col" className="px-4 py-3">Actor</th>
              <th scope="col" className="px-4 py-3">Action</th>
              <th scope="col" className="px-4 py-3">Target</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-zinc-500 dark:text-zinc-400">
                  No entries match these filters.
                </td>
              </tr>
            )}
            {items.map((entry) => (
              <tr
                key={entry.hash}
                tabIndex={0}
                onClick={() => setSelected(entry)}
                onKeyDown={(event) => event.key === 'Enter' && setSelected(entry)}
                className="cursor-pointer border-t border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                <td className="px-4 py-3 font-mono text-xs">{entry.sequence}</td>
                <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">{new Date(entry.timestamp).toLocaleString()}</td>
                <td className="px-4 py-3">{entry.actor}</td>
                <td className="px-4 py-3 font-mono text-xs">{entry.action}</td>
                <td className="px-4 py-3 font-mono text-xs">{entry.target}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data?.nextCursor && (
        <button
          type="button"
          onClick={() => void fetchAuditPage(applied, data.nextCursor ?? undefined).then((result) => apply(result, true))}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold dark:border-zinc-700"
        >
          Load older entries
        </button>
      )}

      {selected && (
        <aside
          role="dialog"
          aria-label={`Audit entry ${selected.sequence}`}
          className="fixed inset-y-0 right-0 z-40 w-full max-w-md overflow-y-auto border-l border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Entry {selected.sequence}</h2>
            <button type="button" onClick={() => setSelected(null)} className="text-sm underline">
              Close
            </button>
          </div>
          <dl className="space-y-3 text-sm">
            {(['timestamp', 'actor', 'action', 'target', 'orgId', 'prevHash', 'hash'] as const).map((field) => (
              <div key={field}>
                <dt className="text-xs font-semibold uppercase text-zinc-500">{field}</dt>
                <dd className="break-all font-mono text-xs">{String(selected[field] ?? '—')}</dd>
              </div>
            ))}
            <div>
              <dt className="text-xs font-semibold uppercase text-zinc-500">metadata</dt>
              <dd>
                <pre className="overflow-x-auto rounded bg-zinc-50 p-2 text-xs dark:bg-zinc-900">
                  {JSON.stringify(selected.metadata, null, 2)}
                </pre>
              </dd>
            </div>
          </dl>
        </aside>
      )}
    </div>
  );
}
