'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { absoluteShort } from '../../utils/datetime';

type WorkflowRun = {
  id: number;
  name: string;
  displayTitle: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  headBranch: string;
  updatedAt: string;
};

const defaultRepository = process.env.NEXT_PUBLIC_GITHUB_REPOSITORY ?? 'SorobanCrashLab/soroban-crashlab';

function formatDate(value: string): string {
  return absoluteShort(value);
}

export default function GithubActionsContent() {
  const [repository, setRepository] = useState(defaultRepository);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [rerunning, setRerunning] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/integrations/github-actions?repository=${encodeURIComponent(repository)}`);
      const payload = await response.json() as { data?: { workflowRuns: WorkflowRun[] }; error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load workflow runs.');
      setRuns(payload.data?.workflowRuns ?? []);
    } catch (loadError) {
      setRuns([]);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load workflow runs.');
    } finally {
      setLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRuns();
  }, [loadRuns]);

  async function handleRepositorySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadRuns();
  }

  async function rerunFailedJobs(run: WorkflowRun) {
    setRerunning(run.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/integrations/github-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repository, runId: run.id }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Unable to queue the re-run.');
      setNotice(`A re-run of failed jobs was queued for “${run.displayTitle}”.`);
    } catch (rerunError) {
      setError(rerunError instanceof Error ? rerunError.message : 'Unable to queue the re-run.');
    } finally {
      setRerunning(null);
    }
  }

  const failedRuns = runs.filter((run) => run.conclusion === 'failure');

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400">GitHub Actions</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">Retry failed CI jobs</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Monitor recent workflows and retry only the failed jobs, directly from the CrashLab dashboard.
        </p>
        <form onSubmit={handleRepositorySubmit} className="mt-6 flex flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="github-repository">GitHub repository</label>
          <input id="github-repository" value={repository} onChange={(event) => setRepository(event.target.value)} placeholder="owner/repository" className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-violet-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white" />
          <button type="submit" disabled={loading} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">{loading ? 'Loading…' : 'Refresh workflows'}</button>
        </form>
      </section>

      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">{notice}</p>}
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}

      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div><h2 className="font-semibold text-zinc-900 dark:text-white">Failed workflow runs</h2><p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{failedRuns.length} run{failedRuns.length === 1 ? '' : 's'} ready to retry</p></div>
        </div>
        {loading ? <div className="p-6 text-sm text-zinc-500 dark:text-zinc-400">Loading GitHub Actions workflow runs…</div> : failedRuns.length === 0 && !error ? <div className="p-6 text-sm text-zinc-500 dark:text-zinc-400">No failed workflow runs were found.</div> : <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">{failedRuns.map((run) => <li key={run.id} className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"><div><a href={run.htmlUrl} target="_blank" rel="noreferrer" className="font-medium text-violet-700 hover:underline dark:text-violet-300">{run.displayTitle || run.name}</a><p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{run.name} · {run.headBranch || 'unknown branch'} · updated {formatDate(run.updatedAt)}</p></div><button type="button" onClick={() => void rerunFailedJobs(run)} disabled={rerunning !== null} className="rounded-lg border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950/40">{rerunning === run.id ? 'Queueing…' : 'Re-run failed jobs'}</button></li>)}</ul>}
      </section>
    </main>
  );
}
