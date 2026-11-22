"use client";

import { useState } from 'react';
import type { InvestigationSet } from '@/lib/correlation/model';

export default function InvestigationSets({
  sets,
  selection,
  canWrite,
  onCreate,
  onExport,
}: {
  sets: InvestigationSet[];
  /** Artifact ids currently selected/related, used to seed a new set. */
  selection: string[];
  canWrite: boolean;
  onCreate: (name: string, artifactIds: string[]) => void;
  onExport: (set: InvestigationSet) => void;
}) {
  const [name, setName] = useState('');
  return (
    <section aria-label="Investigation sets" className="space-y-3">
      {canWrite && (
        <form
          className="flex flex-wrap items-end gap-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || selection.length === 0) return;
            onCreate(name.trim(), selection);
            setName('');
          }}
        >
          <label className="flex flex-col gap-1 text-xs">
            New set from {selection.length} related artifact{selection.length === 1 ? '' : 's'}
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Crash 1042 root cause" className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700" />
          </label>
          <button type="submit" disabled={!name.trim() || selection.length === 0} className="rounded bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700 disabled:opacity-50">Save set</button>
        </form>
      )}
      <ul className="space-y-2">
        {sets.map((s) => (
          <li key={s.id} className="flex items-center justify-between rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
            <span>
              <span className="font-medium">{s.name}</span>
              <span className="ml-2 text-xs text-zinc-500">{s.artifactIds.length} artifacts · {s.createdBy}</span>
            </span>
            <button type="button" onClick={() => onExport(s)} className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">Export bundle</button>
          </li>
        ))}
        {sets.length === 0 && <li className="text-sm text-zinc-500">No investigation sets yet.</li>}
      </ul>
    </section>
  );
}
