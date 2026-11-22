'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  filterIntegrations,
  INTEGRATION_CATEGORIES,
  INTEGRATION_CATALOG,
  type IntegrationCategory,
} from './catalog';

export default function IntegrationCatalog() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<IntegrationCategory | 'All'>('All');
  const filteredIntegrations = useMemo(
    () => filterIntegrations(INTEGRATION_CATALOG, query, category),
    [query, category],
  );

  return (
    <main className="min-h-screen bg-white dark:bg-zinc-950">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-purple-600 dark:text-purple-400">
            Integration marketplace
          </p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Integrations Hub
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
            Browse supported services, review setup requirements, and open the
            relevant configuration or activity page.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div>
              <label htmlFor="integration-search" className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Search integrations
              </label>
              <input
                id="integration-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name, capability, or prerequisite"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
              />
            </div>
            <p aria-live="polite" className="text-sm text-zinc-600 dark:text-zinc-400">
              {filteredIntegrations.length} of {INTEGRATION_CATALOG.length} integrations
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2" aria-label="Filter integrations by category">
            {(['All', ...INTEGRATION_CATEGORIES] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                aria-pressed={category === filter}
                onClick={() => setCategory(filter)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  category === filter
                    ? 'border-purple-600 bg-purple-600 text-white'
                    : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section aria-label="Available integrations" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {filteredIntegrations.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            No integrations match your search. Try another name or category.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredIntegrations.map((integration) => (
              <article
                key={integration.id}
                className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-purple-700 dark:text-purple-300">
                      {integration.category}
                    </p>
                    <h2 className="mt-2 text-xl font-bold text-zinc-900 dark:text-white">
                      {integration.name}
                    </h2>
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                    Setup available
                  </span>
                </div>
                <p className="mt-3 min-h-12 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {integration.description}
                </p>

                <div className="mt-5">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Capabilities</h3>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {integration.capabilities.map((capability) => (
                      <li key={capability} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {capability}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-5">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Prerequisites</h3>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {integration.prerequisites.map((prerequisite) => <li key={prerequisite}>{prerequisite}</li>)}
                  </ul>
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    Typical setup: {integration.setupTime}
                  </p>
                </div>

                <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-zinc-200 pt-5 dark:border-zinc-800">
                  <Link href={integration.href} className="font-semibold text-sm text-purple-700 hover:underline dark:text-purple-300">
                    Configure
                  </Link>
                  {integration.activityHref && (
                    <Link href={integration.activityHref} className="text-sm text-zinc-700 hover:underline dark:text-zinc-300">
                      View activity
                    </Link>
                  )}
                  <a
                    href={integration.documentationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-zinc-700 hover:underline dark:text-zinc-300"
                  >
                    Documentation<span className="sr-only"> for {integration.name} (opens in a new tab)</span>
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
