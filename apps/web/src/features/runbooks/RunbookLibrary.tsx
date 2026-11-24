"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRunbooks, type Identity } from './hooks/useRunbooks';

const STATUS_STYLE: Record<string, string> = {
  approved: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100',
  pending_approval: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  draft: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100',
};

/** Searchable runbook catalog with freshness indicators and one-click start. */
export default function RunbookLibrary({ identity, launchContext }: { identity: Identity; launchContext?: { source: string; refId?: string } }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const { runbooks, loading, error, start, refresh } = useRunbooks(identity, q);
  const [startError, setStartError] = useState<string | null>(null);

  return (
    <section aria-label="Runbook library" className="space-y-3">
      <label className="block text-sm">
        <span className="sr-only">Search runbooks</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title, failure type, or service" className="w-full rounded border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700" />
      </label>
      {loading && <p role="status" className="text-sm text-zinc-500">Loading runbooks…</p>}
      {(error || startError) && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error ?? startError}</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {runbooks.map((rb) => (
          <li key={rb.id} className="space-y-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">{rb.title}</h2>
              <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[rb.status]}`}>{rb.status.replace('_', ' ')}</span>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-300">
              {rb.failureType} · {rb.service} · v{rb.version} · {rb.steps.length} steps
            </p>
            <p className={`text-xs ${rb.stale ? 'font-semibold text-amber-700 dark:text-amber-300' : 'text-zinc-500'}`}>{rb.freshness}</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={rb.status !== 'approved'}
                title={rb.status !== 'approved' ? 'Only approved versions can be executed' : undefined}
                onClick={async () => {
                  try {
                    const ex = await start(rb.id, launchContext);
                    router.push(`/runbooks/${ex.id}`);
                  } catch (e) {
                    setStartError(e instanceof Error ? e.message : 'Could not start');
                  }
                }}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Start playbook
              </button>
              {rb.status === 'draft' && identity.role === 'maintainer' && (
                <button
                  type="button"
                  onClick={async () => {
                    await fetch('/api/runbooks', { method: 'POST', headers: { 'content-type': 'application/json', 'x-crashlab-user': identity.user, 'x-crashlab-role': identity.role }, body: JSON.stringify({ action: 'approve', id: rb.id }) });
                    void refresh();
                  }}
                  className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  Approve
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {!loading && runbooks.length === 0 && <p className="text-sm text-zinc-500">No runbooks match your search.</p>}
    </section>
  );
}
