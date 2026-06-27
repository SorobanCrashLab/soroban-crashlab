import React from 'react';

export default function IntegrationPageSkeleton() {
  return (
    <div role="status" aria-label="Loading integration" className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8 animate-pulse">
      <div className="h-8 w-64 rounded bg-zinc-200 dark:bg-zinc-800 mb-6" />
      <div className="space-y-4">
        <div className="h-32 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900" />
        <div className="h-64 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
