"use client";

import { useState } from 'react';
import GeoTopologyExplorer from '@/features/geo-topology/GeoTopologyExplorer';

/** Map & topology explorer – /analytics/topology. */
export default function TopologyPage() {
  const [role, setRole] = useState<'viewer' | 'responder' | 'maintainer'>('viewer');
  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Network &amp; topology explorer</h1>
        <label className="flex items-center gap-2 text-sm">
          Access level
          <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700">
            <option value="viewer">viewer (redacted)</option>
            <option value="maintainer">maintainer (full detail)</option>
          </select>
        </label>
      </header>
      <GeoTopologyExplorer key={role} role={role} />
    </main>
  );
}
