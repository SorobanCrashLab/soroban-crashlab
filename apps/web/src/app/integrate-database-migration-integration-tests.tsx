'use client';

/**
 * Database migration status panel — wired to the real MigrationRunner (#1681).
 * Replaces the prior mock-only integration-tests UI.
 */

import React, { useCallback, useEffect, useState } from 'react';

interface AppliedRow {
  id: string;
  name: string;
  checksum: string;
  appliedAt: string;
}

interface StatusPayload {
  schemaVersion: number;
  applied: AppliedRow[];
  pending: Array<{ id: string; name: string }>;
  kvRevisions: Record<string, string>;
  error?: string;
}

export default function DatabaseMigrationPanel() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/database/migrations', { cache: 'no-store' });
      const data = (await res.json()) as StatusPayload;
      setStatus(data);
    } catch (error) {
      setStatus({
        schemaVersion: -1,
        applied: [],
        pending: [],
        kvRevisions: {},
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runUp = async () => {
    setBusy(true);
    try {
      await fetch('/api/database/migrations', { method: 'POST' });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Storage migrations</h1>
        <p className="text-sm text-neutral-600">
          Ordered, checksummed migrations applied at boot for sqlite/postgres and via KV key-revision sweeps.
        </p>
      </header>

      {status?.error ? (
        <p className="text-sm text-red-600" role="alert">
          {status.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          className="rounded border px-3 py-1.5 text-sm"
          onClick={() => void refresh()}
          disabled={busy}
        >
          Refresh
        </button>
        <button
          type="button"
          className="rounded border px-3 py-1.5 text-sm"
          onClick={() => void runUp()}
          disabled={busy}
        >
          Apply pending
        </button>
      </div>

      <section>
        <h2 className="text-lg font-medium">Schema version: {status?.schemaVersion ?? '…'}</h2>
        <h3 className="mt-3 font-medium">Applied</h3>
        <ul className="list-disc pl-5 text-sm">
          {(status?.applied ?? []).map((row) => (
            <li key={row.id}>
              {row.id} — {row.name} <span className="font-mono text-xs">({row.checksum})</span>
            </li>
          ))}
          {status && status.applied.length === 0 ? <li>None yet</li> : null}
        </ul>
        <h3 className="mt-3 font-medium">Pending</h3>
        <ul className="list-disc pl-5 text-sm">
          {(status?.pending ?? []).map((row) => (
            <li key={row.id}>
              {row.id} — {row.name}
            </li>
          ))}
          {status && status.pending.length === 0 ? <li>Up to date</li> : null}
        </ul>
        <h3 className="mt-3 font-medium">KV revisions</h3>
        <pre className="overflow-auto rounded bg-neutral-100 p-2 text-xs">
          {JSON.stringify(status?.kvRevisions ?? {}, null, 2)}
        </pre>
      </section>
    </div>
  );
}
