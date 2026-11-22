'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { SimulationResult } from '@/lib/automation/rules';

type Execution = SimulationResult & { actor: string; createdAt: string };
type ExecutionsResponse = { data?: { executions: Execution[] }; error?: string };

export default function AutomationExecutionLog() {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadExecutions = async () => {
      try {
        const response = await fetch('/api/automation/executions?limit=100');
        const payload = await response.json() as ExecutionsResponse;
        if (!response.ok) throw new Error(payload.error ?? 'Unable to load simulation history.');
        if (active) setExecutions(payload.data?.executions ?? []);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load simulation history.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadExecutions();
    return () => { active = false; };
  }, []);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-purple-700 dark:text-purple-300">Automation</p>
          <h1 className="mt-2 text-3xl font-bold text-zinc-900 dark:text-white">Simulation history</h1>
        </div>
        <Link href="/automation" className="text-sm font-semibold text-purple-700 hover:underline dark:text-purple-300">Back to rules</Link>
      </header>
      <p className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
        These entries are dry-run evaluations only. They do not dispatch notifications, modify triage, or control campaigns.
      </p>
      {error && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">{error}</p>}
      <section aria-label="Rule simulation log" className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {loading ? (
          <p className="p-6 text-sm text-zinc-500 dark:text-zinc-400">Loading simulation history…</p>
        ) : executions.length === 0 ? (
          <p className="p-6 text-sm text-zinc-600 dark:text-zinc-400">No simulations have been recorded.</p>
        ) : (
          <ol className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {executions.map((entry, index) => (
              <li key={`${entry.ruleId}-${entry.createdAt}-${index}`} className="space-y-1 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-zinc-900 dark:text-white">
                      Rule {entry.ruleId} · {entry.eventId} · v{entry.ruleVersion} · {entry.matched ? 'matched' : 'not matched'}
                  </p>
                  <time className="text-xs text-zinc-500 dark:text-zinc-400" dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time>
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{entry.explanation}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Actor: {entry.actor} · Actions planned: {entry.actionsPlanned.length} · No side effects</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
