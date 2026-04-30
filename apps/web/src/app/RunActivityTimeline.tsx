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
  isLoading?: boolean;
  error?: string | null;
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
  completed: 'bg-emerald-500 text-white shadow-emerald-500/20',
  failed: 'bg-rose-500 text-white shadow-rose-500/20',
  running: 'bg-blue-500 text-white shadow-blue-500/20',
  cancelled: 'bg-zinc-500 text-white shadow-zinc-500/20',
};

export default function RunActivityTimeline({ 
    runs,
    isLoading = false,
    error = null
}: RunStatusTimelineProps) {
  if (error) {
    return (
      <div className="w-full p-12 bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800/50 rounded-[2rem] flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-rose-600 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-rose-900 dark:text-rose-100">Failed to load activity</h3>
        <p className="text-sm text-rose-700 dark:text-rose-300 mt-2 max-w-md">{error}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full rounded-[2rem] border border-zinc-200 dark:border-zinc-800 bg-white/50 p-8 shadow-sm dark:bg-zinc-950/50 animate-pulse">
        <div className="h-4 w-24 bg-zinc-200 dark:bg-zinc-800 rounded mb-4" />
        <div className="h-8 w-48 bg-zinc-200 dark:bg-zinc-800 rounded mb-8" />
        <div className="space-y-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex gap-6">
              <div className="h-12 w-12 rounded-xl bg-zinc-200 dark:bg-zinc-800 shrink-0" />
              <div className="flex-1 h-20 bg-zinc-200 dark:bg-zinc-800 rounded-2xl" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const recentRuns = runs.slice(0, 8);

  return (
    <section className="w-full rounded-[2rem] border border-zinc-200 bg-white/80 backdrop-blur-xl p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950/80 md:p-10 transition-all hover:shadow-2xl hover:border-blue-500/20">
      <div className="mb-10">
        <p className="mb-4 text-xs font-bold uppercase tracking-[0.3em] text-blue-600 dark:text-blue-400">
          Activity feed
        </p>
        <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400 bg-clip-text text-transparent">
          Run Status Timeline
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400 md:text-base max-w-2xl">
          A real-time visual history of your most recent fuzzing campaigns and their outcomes. 
          Monitor progress and identify failures across your Soroban ecosystem.
        </p>
      </div>

      <div className="relative">
        {/* Vertical line connector */}
        <div className="absolute left-6 top-4 bottom-4 w-0.5 bg-zinc-100 dark:bg-zinc-900 rounded-full" aria-hidden="true" />

        <div className="space-y-10">
          {recentRuns.map((run) => (
            <div key={run.id} className="relative pl-14 group/item" tabIndex={0} role="listitem" aria-label={`Run ${run.id}: ${run.status}`}>
              {/* Timeline marker */}
              <div className={`absolute left-0 top-2 h-12 w-12 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-300 group-hover/item:scale-110 group-hover/item:rotate-3 z-10 ${STATUS_COLORS[run.status]}`}>
                {STATUS_ICONS[run.status]}
              </div>

              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 p-6 rounded-[1.5rem] border border-zinc-100 bg-white/50 backdrop-blur-sm hover:bg-white hover:shadow-xl hover:border-blue-500/10 transition-all duration-300 dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:bg-zinc-900/60">
                <div className="flex-1">
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-xl font-black text-zinc-900 dark:text-zinc-100 tracking-tighter">{run.id}</span>
                    <span className={`px-3 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest border transition-colors ${
                      run.status === 'failed' ? 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900' :
                      run.status === 'completed' ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900' :
                      'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900'
                    }`}>
                      {run.status}
                    </span>
                  </div>
                  <div className="mt-3 text-sm text-zinc-500 dark:text-zinc-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-bold text-zinc-700 dark:text-zinc-300 capitalize">{run.area}</span>
                    <span className="text-zinc-300 dark:text-zinc-700">&bull;</span>
                    <span className="font-medium">{run.severity} priority</span>
                    <span className="text-zinc-300 dark:text-zinc-700">&bull;</span>
                    <span className="font-medium text-zinc-400">{formatRelativeTime(run.queuedAt)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-8 self-end md:self-center">
                  <div className="text-right">
                    <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-1">Seeds</div>
                    <div className="text-xl font-black text-zinc-900 dark:text-zinc-100 tracking-tighter">{run.seedCount.toLocaleString()}</div>
                  </div>
                  <div className="h-10 w-px bg-zinc-100 dark:bg-zinc-800" />
                  <button 
                    onClick={() => window.location.href = `/runs/${run.id}`}
                    className="px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-bold uppercase tracking-widest hover:bg-blue-600 transition-all duration-300 shadow-lg shadow-zinc-900/10 hover:shadow-blue-600/20 active:scale-95 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                  >
                    Details
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
