'use client';

import React from 'react';
import type { FuzzingRun } from './types';

const formatRelativeTime = (iso?: string): string => {
  if (!iso) return 'No timestamp';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

type RunStatusTimelineProps = {
  runs: FuzzingRun[];
};

const STATUS_ICONS = {
  completed: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  failed: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  running: (
    <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582M20 20v-5h-.581M5.635 15A9 9 0 1118.365 9" />
    </svg>
  ),
  cancelled: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  ),
};

const STATUS_COLORS = {
  completed: 'bg-emerald-500 text-white',
  failed: 'bg-rose-500 text-white',
  running: 'bg-blue-500 text-white',
  cancelled: 'bg-zinc-500 text-white',
};

export default function AddRunStatusTimeline({ runs }: RunStatusTimelineProps) {
  const recentRuns = runs.slice(0, 8); // Show only the 8 most recent runs in the timeline

  return (
    <section className="w-full rounded-[2rem] border border-black/[.08] bg-white/95 p-6 shadow-sm dark:border-white/[.145] dark:bg-zinc-950/90 md:p-8">
      <div className="mb-8">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-blue-600 dark:text-blue-300">
          Activity feed
        </p>
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Run Status Timeline
        </h2>
        <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400 md:text-base">
          A real-time visual history of your most recent fuzzing campaigns and their outcomes.
        </p>
      </div>

      <div className="relative">
        {/* Vertical line connector */}
        <div className="absolute left-6 top-2 bottom-2 w-0.5 bg-zinc-200 dark:bg-zinc-800" aria-hidden="true" />

        <div className="space-y-8">
          {recentRuns.map((run) => (
            <div key={run.id} className="relative pl-14 group">
              {/* Timeline marker */}
              <div className={`absolute left-0 top-1 h-12 w-12 rounded-xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 z-10 ${STATUS_COLORS[run.status]}`}>
                {STATUS_ICONS[run.status]}
              </div>

              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-5 rounded-2xl border border-zinc-200 bg-white/50 hover:bg-white hover:shadow-md transition dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:bg-zinc-900">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-lg font-bold text-zinc-900 dark:text-zinc-100">{run.id}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      run.status === 'failed' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' :
                      run.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' :
                      'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                    }`}>
                      {run.status}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">{run.area}</span>
                    <span>&bull;</span>
                    <span>{run.severity} severity</span>
                    <span>&bull;</span>
                    <span>{formatRelativeTime(run.queuedAt)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Seeds</div>
                    <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{run.seedCount.toLocaleString()}</div>
                  </div>
                  <div className="h-8 w-px bg-zinc-200 dark:bg-zinc-800" />
                  <button className="px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-black transition dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white">
                    View Details
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
