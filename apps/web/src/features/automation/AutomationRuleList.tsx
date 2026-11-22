'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { WorkflowRule } from '@/lib/automation/rules';

type RulesResponse = { data?: { rules: WorkflowRule[] }; error?: string };

export default function AutomationRuleList() {
  const [rules, setRules] = useState<WorkflowRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadRules = async () => {
      try {
        const response = await fetch('/api/automation/rules');
        const payload = await response.json() as RulesResponse;
        if (!response.ok) throw new Error(payload.error ?? 'Unable to load automation rules.');
        if (active) setRules(payload.data?.rules ?? []);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load automation rules.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadRules();
    return () => { active = false; };
  }, []);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-purple-700 dark:text-purple-300">Automation</p>
          <h1 className="mt-2 text-3xl font-bold text-zinc-900 dark:text-white">Workflow rules</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Build deterministic trigger, condition, and action rules. Test changes with sample events before reviewing the rule.
          </p>
        </div>
        <Link href="/automation/new" className="inline-flex justify-center rounded-lg bg-purple-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-800">
          Create rule
        </Link>
      </header>

      <div role="note" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        Rules can be drafted, versioned, and simulated here. Simulation is dry-run only; no actions are dispatched. Production event execution is not connected yet.
      </div>

      <nav aria-label="Automation pages" className="flex gap-4 text-sm">
        <Link href="/automation" aria-current="page" className="font-semibold text-purple-700 dark:text-purple-300">Rules</Link>
        <Link href="/automation/executions" className="text-zinc-700 hover:underline dark:text-zinc-300">Simulation history</Link>
      </nav>

      {error && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">{error}</p>}

      <section aria-label="Workflow rules" className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {loading ? (
          <p className="p-6 text-sm text-zinc-500 dark:text-zinc-400">Loading workflow rules…</p>
        ) : rules.length === 0 ? (
          <div className="p-8 text-center">
            <h2 className="font-semibold text-zinc-900 dark:text-white">No workflow rules yet</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Start with a draft and simulate it against sample events.</p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {rules.map((rule) => (
              <li key={rule.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-semibold text-zinc-900 dark:text-white">{rule.name}</h2>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {rule.trigger} · {rule.conditions.length} condition{rule.conditions.length === 1 ? '' : 's'} · {rule.actions.length} action{rule.actions.length === 1 ? '' : 's'} · v{rule.version}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold capitalize text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{rule.status}</span>
                  <Link href={`/automation/${rule.id}`} className="text-sm font-semibold text-purple-700 hover:underline dark:text-purple-300">Edit rule</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
