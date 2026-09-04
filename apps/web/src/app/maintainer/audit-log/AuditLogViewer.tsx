'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMaintainerMode } from '../../useMaintainerMode';
import { getAuditLog, type AuditEntry } from '@/lib/audit';
import type { AuditAction, ChainVerification } from '@/lib/audit/audit-log';
import {
  AUDIT_PAGE_SIZE,
  filterAuditEntries,
  pageCount,
  pageOf,
  toCsv,
  type AuditFilter,
} from '@/lib/audit/audit-view-utils';

const ACTIONS: Array<AuditAction | 'all'> = [
  'all',
  'run.delete',
  'token.revoke',
  'config.bundle.import',
  'rbac.change',
  'dlq.purge',
  'dlq.replay',
  'thread.resolve',
  'artifact.delete',
];

export default function AuditLogViewer() {
  const { isMaintainer, mounted } = useMaintainerMode();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [integrity, setIntegrity] = useState<ChainVerification | null>(null);
  const [filter, setFilter] = useState<AuditFilter>({ action: 'all' });
  const [page, setPage] = useState(1);

  useEffect(() => {
    // Storage is browser-only; the integrity self-check runs on every load so a
    // tampered log announces itself before anyone reads it as evidence.
    queueMicrotask(() => {
      const log = getAuditLog();
      setEntries(log.list());
      setIntegrity(log.verify());
    });
  }, []);

  const filtered = useMemo(() => filterAuditEntries(entries, filter), [entries, filter]);
  const visible = pageOf(filtered, page);
  const totalPages = pageCount(filtered.length);

  const handleExport = () => {
    const blob = new Blob([toCsv(filtered)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'crashlab-audit-log.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const update = (patch: Partial<AuditFilter>) => {
    setFilter((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  if (mounted && !isMaintainer) {
    return (
      <p className="text-meta text-sm">
        The audit log records maintainer actions, so it is visible in maintainer mode only. Enable
        it in Settings to continue.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {integrity?.status === 'broken' && (
        <p
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
        >
          <strong>Integrity check failed.</strong> {integrity.reason} Entries from this point on
          cannot be trusted as an unbroken record.
        </p>
      )}
      {integrity?.status === 'intact' && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          Hash chain verified across {entries.length} {entries.length === 1 ? 'entry' : 'entries'}.
        </p>
      )}
      {integrity?.status === 'empty' && (
        <p className="text-meta text-sm">No sensitive actions have been recorded yet.</p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="audit-actor" className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
            Actor
          </label>
          <input
            id="audit-actor"
            value={filter.actor ?? ''}
            onChange={(event) => update({ actor: event.target.value })}
            className="mt-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </div>
        <div>
          <label htmlFor="audit-action" className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
            Action
          </label>
          <select
            id="audit-action"
            value={filter.action ?? 'all'}
            onChange={(event) => update({ action: event.target.value as AuditAction | 'all' })}
            className="mt-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {ACTIONS.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="audit-target" className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
            Target
          </label>
          <input
            id="audit-target"
            value={filter.target ?? ''}
            onChange={(event) => update({ target: event.target.value })}
            className="mt-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </div>
        <div>
          <label htmlFor="audit-since" className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
            Since
          </label>
          <input
            id="audit-since"
            type="date"
            value={filter.since ?? ''}
            onChange={(event) => update({ since: event.target.value })}
            className="mt-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={filtered.length === 0}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700"
        >
          Export CSV ({filtered.length})
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th scope="col" className="px-4 py-3">#</th>
              <th scope="col" className="px-4 py-3">When</th>
              <th scope="col" className="px-4 py-3">Actor</th>
              <th scope="col" className="px-4 py-3">Action</th>
              <th scope="col" className="px-4 py-3">Target</th>
              <th scope="col" className="px-4 py-3">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-zinc-500 dark:text-zinc-400">
                  No entries match these filters.
                </td>
              </tr>
            )}
            {visible.map((entry) => (
              <tr key={entry.hash} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="px-4 py-3 font-mono text-xs">{entry.sequence}</td>
                <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                  {new Date(entry.timestamp).toLocaleString()}
                </td>
                <td className="px-4 py-3">{entry.actor}</td>
                <td className="px-4 py-3 font-mono text-xs">{entry.action}</td>
                <td className="px-4 py-3 font-mono text-xs">{entry.target}</td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {JSON.stringify(entry.metadata)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 font-semibold disabled:opacity-50 dark:border-zinc-700"
          >
            Previous
          </button>
          <span className="text-meta">
            Page {page} of {totalPages} · {AUDIT_PAGE_SIZE} per page
          </span>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page === totalPages}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 font-semibold disabled:opacity-50 dark:border-zinc-700"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
