'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MOCK_DLQ_ENTRIES } from '@/fixtures/webhook-dlq';
import {
  createInMemoryDlqGateway,
  DeadLetterQueue,
  DLQ_REPLAY_CONCURRENCY,
  DLQ_RETENTION_DAYS,
  filterDlqEntries,
  type DlqEntry,
  type DlqFailureReason,
} from '@/lib/webhook-dlq';

type ReasonFilter = 'all' | DlqFailureReason;
type AgeFilter = 'all' | '24h' | '7d';

const AGE_MS: Record<Exclude<AgeFilter, 'all'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

const REASON_LABEL: Record<DlqFailureReason, string> = {
  'retries-exhausted': 'Retries exhausted',
  'non-retryable': 'Non-retryable',
};

/** Retention sweeps also run on an interval so a long-lived tab stays honest. */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

const formatWhen = (iso: string): string =>
  new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

export default function DeadLetterQueueComponent() {
  // A 401 will 401 again, so a non-retryable entry fails its replay in this
  // mock-data view rather than silently disappearing.
  const queue = useMemo(
    () =>
      new DeadLetterQueue({
        gateway: createInMemoryDlqGateway(MOCK_DLQ_ENTRIES),
        replayDelivery: async (entry) =>
          entry.reason === 'non-retryable'
            ? { ok: false, statusCode: 401, error: 'HTTP 401 (endpoint still rejects this payload)' }
            : { ok: true, statusCode: 200 },
      }),
    [],
  );

  const [entries, setEntries] = useState<DlqEntry[]>([]);
  const [endpointFilter, setEndpointFilter] = useState('');
  const [reasonFilter, setReasonFilter] = useState<ReasonFilter>('all');
  const [ageFilter, setAgeFilter] = useState<AgeFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const sweptOnLoad = useRef(false);

  const refresh = useCallback(() => setEntries(queue.list()), [queue]);

  useEffect(() => {
    // Sweep on load, then hourly: expiry is what keeps the queue bounded.
    // queueMicrotask keeps the first setState out of the effect body, matching
    // the deferred-hydration pattern used elsewhere in the app.
    queueMicrotask(() => {
      if (!sweptOnLoad.current) {
        sweptOnLoad.current = true;
        queue.sweep();
      }
      refresh();
    });

    const timer = setInterval(() => {
      queue.sweep();
      refresh();
    }, SWEEP_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [queue, refresh]);

  const visible = useMemo(
    () =>
      filterDlqEntries(entries, {
        endpoint: endpointFilter || undefined,
        reason: reasonFilter === 'all' ? undefined : reasonFilter,
        maxAgeMs: ageFilter === 'all' ? undefined : AGE_MS[ageFilter],
      }),
    [entries, endpointFilter, reasonFilter, ageFilter],
  );

  const selected = entries.find((entry) => entry.id === selectedId) ?? null;

  const runReplay = async (ids: string[]) => {
    setBusyIds((current) => [...current, ...ids]);
    try {
      const result = await queue.replayBatch(ids);
      setNotice(
        `Replayed ${result.replayed} of ${ids.length} in ${result.batches} ` +
          `${result.batches === 1 ? 'batch' : 'batches'}` +
          (result.failed > 0 ? ` — ${result.failed} stayed in the queue.` : '.'),
      );
      refresh();
      if (ids.includes(selectedId ?? '') && !queue.list().some((e) => e.id === selectedId)) {
        setSelectedId(null);
      }
    } finally {
      setBusyIds((current) => current.filter((id) => !ids.includes(id)));
    }
  };

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Dead-letter queue</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Deliveries that failed terminally, with the full attempt chain. Entries are evicted after{' '}
          {DLQ_RETENTION_DAYS} days. Batch replays run {DLQ_REPLAY_CONCURRENCY} at a time.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label htmlFor="dlq-endpoint" className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
            Endpoint
          </label>
          <input
            id="dlq-endpoint"
            value={endpointFilter}
            onChange={(event) => setEndpointFilter(event.target.value)}
            placeholder="Filter by URL…"
            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </div>
        <div>
          <label htmlFor="dlq-reason" className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
            Status
          </label>
          <select
            id="dlq-reason"
            value={reasonFilter}
            onChange={(event) => setReasonFilter(event.target.value as ReasonFilter)}
            className="mt-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="all">All statuses</option>
            <option value="retries-exhausted">Retries exhausted</option>
            <option value="non-retryable">Non-retryable</option>
          </select>
        </div>
        <div>
          <label htmlFor="dlq-age" className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
            Age
          </label>
          <select
            id="dlq-age"
            value={ageFilter}
            onChange={(event) => setAgeFilter(event.target.value as AgeFilter)}
            className="mt-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="all">Any age</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => runReplay(visible.map((entry) => entry.id))}
          disabled={visible.length === 0 || busyIds.length > 0}
          className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Replay filtered ({visible.length})
        </button>
      </div>

      {notice && (
        <p role="status" className="rounded-lg bg-zinc-100 p-3 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
          {notice}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th scope="col" className="px-4 py-3">Endpoint</th>
              <th scope="col" className="px-4 py-3">Event</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3">Dead-lettered</th>
              <th scope="col" className="px-4 py-3">Attempts</th>
              <th scope="col" className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-zinc-500 dark:text-zinc-400">
                  No dead-lettered deliveries match these filters.
                </td>
              </tr>
            )}
            {visible.map((entry) => {
              const busy = busyIds.includes(entry.id);
              return (
                <tr key={entry.id} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="px-4 py-3 font-mono text-xs">{entry.endpoint}</td>
                  <td className="px-4 py-3">{entry.eventType}</td>
                  <td className="px-4 py-3">{REASON_LABEL[entry.reason]}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                    {formatWhen(entry.deadLetteredAt)}
                  </td>
                  <td className="px-4 py-3">
                    {entry.errorTimeline.length}
                    {entry.replayAttempts > 0 && ` (+${entry.replayAttempts} replays)`}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedId(entry.id)}
                        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold dark:border-zinc-700"
                      >
                        Details
                      </button>
                      <button
                        type="button"
                        onClick={() => runReplay([entry.id])}
                        disabled={busy}
                        className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busy ? 'Replaying…' : 'Replay'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <aside
          aria-label={`Failure chain for ${selected.requestId}`}
          className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">{selected.requestId}</h2>
              <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{selected.endpoint}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold dark:border-zinc-700"
            >
              Close
            </button>
          </div>

          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Failure chain
          </h3>
          <ol className="mt-2 space-y-2">
            {selected.errorTimeline.map((note, index) => (
              <li key={index} className="rounded-lg bg-zinc-50 px-3 py-2 text-xs dark:bg-zinc-800">
                <span className="font-semibold">Attempt {note.attempt}</span>
                {note.statusCode !== undefined && ` · ${note.statusCode}`}
                {note.error && ` · ${note.error}`}
                <span className="ml-2 text-zinc-500 dark:text-zinc-400">{formatWhen(note.at)}</span>
              </li>
            ))}
          </ol>

          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Payload
          </h3>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-950 p-3 text-xs text-zinc-100">
            {JSON.stringify(selected.payload, null, 2)}
          </pre>
        </aside>
      )}
    </section>
  );
}
