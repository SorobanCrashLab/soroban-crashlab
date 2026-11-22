'use client';

import type { StateSnapshot } from '@/lib/state/normalizeSnapshots';

interface Props {
  snapshots: StateSnapshot[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export default function StateTimeline({ snapshots, selectedIndex, onSelect }: Props) {
  if (!snapshots.length) {
    return <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-500 dark:border-zinc-700">No snapshots were recorded for this run.</div>;
  }
  return (
    <section aria-label="State snapshot timeline" className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-semibold">Snapshot timeline</h2>
        <span className="text-xs text-zinc-500">{snapshots.length} checkpoints</span>
      </div>
      <ol className="flex gap-2 overflow-x-auto pb-2">
        {snapshots.map((snapshot, index) => (
          <li key={snapshot.id} className="min-w-36 flex-1">
            <button type="button" onClick={() => onSelect(index)} aria-pressed={selectedIndex === index}
              className={`w-full rounded-lg border p-3 text-left transition ${selectedIndex === index ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-500 dark:bg-sky-950/30' : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800'}`}>
              <span className="block text-xs font-semibold text-zinc-500">{snapshot.ledger !== undefined ? `Ledger ${snapshot.ledger}` : `Checkpoint ${index + 1}`}</span>
              <span className="mt-1 block truncate text-sm font-medium">{snapshot.label}</span>
              <span className="mt-2 block text-xs text-zinc-500">{Object.keys(snapshot.entries).length} keys · {snapshot.complete ? 'complete' : 'partial'}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
        <span>Use the checkpoints to select a before/after state.</span>
        <span>{selectedIndex + 1} / {snapshots.length}</span>
      </div>
    </section>
  );
}
