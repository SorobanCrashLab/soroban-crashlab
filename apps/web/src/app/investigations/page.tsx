"use client";

import { useMemo, useState } from 'react';
import CorrelationWorkspace from '@/features/correlation/CorrelationWorkspace';
import type { CorrelationIdentity } from '@/features/correlation/hooks/useCorrelation';

/** Cross-artifact correlation workspace – /investigations. */
export default function InvestigationsPage() {
  const [role, setRole] = useState<CorrelationIdentity['role']>('responder');
  const identity = useMemo<CorrelationIdentity>(() => ({ user: `demo-${role}`, role }), [role]);
  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Investigations</h1>
        <label className="flex items-center gap-2 text-sm">
          Acting as
          <select value={role} onChange={(e) => setRole(e.target.value as CorrelationIdentity['role'])} className="rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700">
            <option value="viewer">viewer (read-only, restricted redacted)</option>
            <option value="responder">responder</option>
            <option value="maintainer">maintainer (sees restricted)</option>
          </select>
        </label>
      </header>
      <CorrelationWorkspace key={role} identity={identity} />
    </main>
  );
}
