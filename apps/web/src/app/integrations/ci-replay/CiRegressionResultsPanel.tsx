'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import type { CiResultRecord } from '@/lib/storage/ci-results-store';
import type { ClassifiedFixture } from '@/lib/integrations/ci-regression/types';
import { absoluteShort } from '../../utils/datetime';

/**
 * Per-commit / per-PR regression status posted by CI (#1890), so "did this PR
 * regress us?" is answered here instead of in workflow logs. Each row drills
 * into its fixtures and links back to the GitHub run.
 */

const CLASSIFICATION_STYLES: Record<ClassifiedFixture['classification'], string> = {
  new: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300',
  recurring: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  fixed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
  unchanged: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
};

function buildQuery(filter: string): string {
  const value = filter.trim();
  if (/^#?[1-9][0-9]*$/.test(value)) return `?pr=${value.replace('#', '')}`;
  if (/^[0-9a-f]{40}$/.test(value)) return `?sha=${value}`;
  return '';
}

export default function CiRegressionResultsPanel() {
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('');
  const [records, setRecords] = useState<CiResultRecord[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/integrations/ci/results${query}`);
      const payload = (await response.json()) as { data?: { results: CiResultRecord[] }; error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load CI regression results.');
      setRecords(payload.data?.results ?? []);
    } catch (loadError) {
      setRecords([]);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load CI regression results.');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function handleFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = buildQuery(filter);
    if (filter.trim() && !next) {
      setError('Filter by a PR number (e.g. 1890) or a full 40-character commit SHA.');
      return;
    }
    setQuery(next);
  }

  return (
    <section
      aria-labelledby="ci-regression-results-heading"
      className="mb-6 rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex flex-col gap-4 border-b border-zinc-200 px-6 py-4 sm:flex-row sm:items-end sm:justify-between dark:border-zinc-800">
        <div>
          <h2 id="ci-regression-results-heading" className="font-semibold text-zinc-900 dark:text-white">
            Regression status by commit
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Results posted by the Regression Test Suite workflow for pull requests, main and nightly replays.
          </p>
        </div>
        <form onSubmit={handleFilter} className="flex gap-2">
          <label className="sr-only" htmlFor="ci-regression-filter">PR number or commit SHA</label>
          <input
            id="ci-regression-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="PR # or commit SHA"
            className="w-48 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-violet-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Filter
          </button>
        </form>
      </div>

      {error && (
        <p role="alert" className="m-6 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </p>
      )}

      {loading ? (
        <div className="p-6 text-sm text-zinc-500 dark:text-zinc-400">Loading regression results…</div>
      ) : records.length === 0 && !error ? (
        <div className="p-6 text-sm text-zinc-500 dark:text-zinc-400">
          No regression results yet. They appear once the workflow posts with a <code>ci:write</code> token.
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {records.map((record) => {
            const { result, deltas } = record;
            const open = expanded === record.id;
            const regressed = deltas.blocking > 0;
            return (
              <li key={record.id} className="p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-white">
                      <span
                        className={`mr-2 rounded-full px-2 py-0.5 text-xs font-semibold ${regressed ? CLASSIFICATION_STYLES.new : CLASSIFICATION_STYLES.fixed}`}
                      >
                        {regressed ? `${deltas.blocking} new` : 'no new failures'}
                      </span>
                      <code>{result.commitSha.slice(0, 7)}</code>
                      {result.prNumber !== null && <> · PR #{result.prNumber}</>}
                      <span className="text-zinc-500 dark:text-zinc-400"> · {result.event}</span>
                    </p>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      new {deltas.new} · recurring {deltas.recurring} · fixed {deltas.fixed} · unchanged{' '}
                      {deltas.unchanged} · {absoluteShort(result.completedAt)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {result.runUrl && (
                      <a
                        href={result.runUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                      >
                        Workflow run
                      </a>
                    )}
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={`ci-fixtures-${record.id}`}
                      onClick={() => setExpanded(open ? null : record.id)}
                      className="rounded-lg border border-violet-300 px-3 py-1.5 text-sm font-semibold text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950/40"
                    >
                      {open ? 'Hide fixtures' : `Fixtures (${deltas.total})`}
                    </button>
                  </div>
                </div>
                {open && (
                  <div id={`ci-fixtures-${record.id}`} className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="text-xs uppercase text-zinc-500 dark:text-zinc-400">
                        <tr>
                          <th scope="col" className="py-2 pr-4">Fixture</th>
                          <th scope="col" className="py-2 pr-4">Classification</th>
                          <th scope="col" className="py-2 pr-4">Expected</th>
                          <th scope="col" className="py-2">Actual</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {result.fixtures.map((fixture) => (
                          <tr key={fixture.id}>
                            <td className="py-2 pr-4"><code>{fixture.id}</code></td>
                            <td className="py-2 pr-4">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CLASSIFICATION_STYLES[fixture.classification]}`}>
                                {fixture.classification}
                              </span>
                            </td>
                            <td className="py-2 pr-4">{fixture.expectedClass}</td>
                            <td className="py-2">{fixture.error ?? fixture.actualClass ?? 'none'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
