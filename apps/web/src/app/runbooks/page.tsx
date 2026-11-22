"use client";

import { useState } from 'react';
import RunbookLibrary from '@/features/runbooks/RunbookLibrary';
import RunbookEditor from '@/features/runbooks/RunbookEditor';
import type { Identity } from '@/features/runbooks/hooks/useRunbooks';
import type { RunbookRole } from '@/features/runbooks/model';

/** Interactive runbooks – /runbooks. Launch context can be passed as ?source=incident&ref=inc-1. */
export default function RunbooksPage() {
  const [role, setRole] = useState<RunbookRole>('responder');
  const [tab, setTab] = useState<'library' | 'editor'>('library');
  const identity: Identity = { user: 'demo-user', role };
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const launchContext = params?.get('source') ? { source: params.get('source') as string, refId: params.get('ref') ?? undefined } : undefined;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Runbooks &amp; debugging playbooks</h1>
        <label className="flex items-center gap-2 text-sm">
          Acting as
          <select value={role} onChange={(e) => setRole(e.target.value as RunbookRole)} className="rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700">
            <option value="viewer">viewer</option>
            <option value="responder">responder</option>
            <option value="maintainer">maintainer</option>
          </select>
        </label>
      </header>
      <div role="tablist" aria-label="Runbook sections" className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800">
        {(['library', 'editor'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`px-3 py-2 text-sm font-medium ${tab === t ? 'border-b-2 border-blue-600 text-blue-700 dark:text-blue-300' : 'text-zinc-600 dark:text-zinc-300'}`}>
            {t === 'library' ? 'Library' : 'Create template'}
          </button>
        ))}
      </div>
      {tab === 'library' ? <RunbookLibrary identity={identity} launchContext={launchContext} /> : <RunbookEditor identity={identity} />}
    </main>
  );
}
