'use client';

import Link from 'next/link';
import { buildFailureClusters, describeFailureCluster } from './failureClusters';
import { FuzzingRun } from './types';

interface FailureClusterViewProps {
  runs: FuzzingRun[];
  pathname: string;
  queryString: string;
}

const severityBadgeClasses = {
  low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  critical: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
} as const;

const buildRepresentativeHref = (pathname: string, queryString: string, runId: string): string => {
  const params = new URLSearchParams(queryString);
  params.set('run', runId);
  const nextQuery = params.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
};

export default function FailureClusterView({ runs, pathname, queryString }: FailureClusterViewProps) {
  const clusters = buildFailureClusters(runs);

  return (
    <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Failure Clusters</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Group repeated crashes by signature and runtime context so triage can start from one representative sample.
          </p>
        </div>
        <div className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {clusters.length} grouped signatures
        </div>
      </div>

      {clusters.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-400">
          No failed runs with crash signatures are available yet.
        </div>
      ) : (
        <div className="space-y-4">
          {clusters.map((cluster) => (
            <article
              key={cluster.id}
              className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
            >
              <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                      {cluster.count} related crashes
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${severityBadgeClasses[cluster.severity]}`}
                    >
                      {cluster.severity}
                    </span>
                  </div>
                  <p className="font-mono text-sm font-semibold break-all text-zinc-900 dark:text-zinc-100">
                    {cluster.signature}
                  </p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{describeFailureCluster(cluster)}</p>
                </div>

                <Link
                  href={buildRepresentativeHref(pathname, queryString, cluster.representativeRunId)}
                  className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Open sample {cluster.representativeRunId}
                </Link>
              </div>

              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Representative sample: {cluster.representativeRunId}. Related runs: {cluster.relatedRunIds.join(', ')}.
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
