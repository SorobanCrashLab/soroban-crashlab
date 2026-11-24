'use client';

import { useMemo, useState } from 'react';
import { diffStateSnapshots } from '@/lib/state/diffEngine';
import type { StateInspectorData } from '@/lib/state/normalizeSnapshots';

interface Props {
  data: StateInspectorData;
  comparison?: StateInspectorData | null;
}

export default function StateDiffViewer({ data, comparison }: Props) {
  const [fromIndex, setFromIndex] = useState(0);
  const [toIndex, setToIndex] = useState(Math.max(0, data.snapshots.length - 1));
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [visible, setVisible] = useState(100);
  const [compareMode, setCompareMode] = useState(false);
  const source = compareMode && comparison?.snapshots.length ? comparison : data;
  const from = source.snapshots[Math.min(fromIndex, Math.max(0, source.snapshots.length - 1))];
  const to = source.snapshots[Math.min(toIndex, Math.max(0, source.snapshots.length - 1))];
  const changes = useMemo(() => diffStateSnapshots(from, to), [from, to]);
  const filtered = changes.filter((entry) =>
    (kind === 'all' || entry.changeType === kind) &&
    (!query || entry.path.toLowerCase().includes(query.toLowerCase())),
  );
  const counts = {
    added: changes.filter((item) => item.changeType === 'added').length,
    removed: changes.filter((item) => item.changeType === 'removed').length,
    modified: changes.filter((item) => item.changeType === 'modified').length,
  };

  if (data.snapshots.length < 2 && !comparison?.snapshots.length) {
    return <div className="rounded-xl border border-dashed border-zinc-300 p-5 text-sm text-zinc-500 dark:border-zinc-700">At least two snapshots are needed for a point-in-time diff. Mutation events remain available below.</div>;
  }

  return (
    <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-semibold">Key-level state diff</h2><p className="text-xs text-zinc-500">Canonical key order · nested values · bounded rendering</p></div>
        {comparison?.snapshots.length ? <button type="button" className="chip text-xs" aria-pressed={compareMode} onClick={() => { setCompareMode(!compareMode); setFromIndex(0); setToIndex(Math.max(0, (compareMode ? data : comparison).snapshots.length - 1)); }}>{compareMode ? 'Show current run' : `Compare ${comparison.runId}`}</button> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-zinc-500">Before
          <select value={fromIndex} onChange={(event) => setFromIndex(Number(event.target.value))} className="mt-1 block w-full rounded-lg border border-zinc-300 bg-transparent p-2 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-100">
            {source.snapshots.map((snapshot, index) => <option key={snapshot.id} value={index}>{snapshot.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-zinc-500">After
          <select value={toIndex} onChange={(event) => setToIndex(Number(event.target.value))} className="mt-1 block w-full rounded-lg border border-zinc-300 bg-transparent p-2 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-100">
            {source.snapshots.map((snapshot, index) => <option key={snapshot.id} value={index}>{snapshot.label}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Diff summary">
        <span className="chip text-xs">+ {counts.added} added</span><span className="chip text-xs">− {counts.removed} removed</span><span className="chip text-xs">~ {counts.modified} modified</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <input value={query} onChange={(event) => { setQuery(event.target.value); setVisible(100); }} placeholder="Search key or nested path" aria-label="Search diff keys" className="min-w-48 flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" />
        <select value={kind} onChange={(event) => { setKind(event.target.value); setVisible(100); }} aria-label="Filter diff type" className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700">
          <option value="all">All changes</option><option value="added">Added</option><option value="removed">Removed</option><option value="modified">Modified</option>
        </select>
      </div>
      {filtered.length ? <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-800"><tr><th className="p-3">Key / path</th><th className="p-3">Change</th><th className="p-3">Before</th><th className="p-3">After</th></tr></thead>
          <tbody>{filtered.slice(0, visible).map((entry) => <tr key={entry.path} className="border-t border-zinc-100 dark:border-zinc-800">
            <td className="max-w-64 break-all p-3 font-mono text-xs">{entry.path}</td>
            <td className="p-3"><span className="rounded px-2 py-1 text-xs font-semibold">{entry.changeType}</span></td>
            <td className="max-w-64 break-all p-3 font-mono text-xs text-zinc-500">{entry.before === undefined ? '—' : JSON.stringify(entry.before)}</td>
            <td className="max-w-64 break-all p-3 font-mono text-xs">{entry.after === undefined ? '—' : JSON.stringify(entry.after)}</td>
          </tr>)}</tbody>
        </table>
        {filtered.length > visible ? <button type="button" className="w-full border-t border-zinc-200 p-3 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800" onClick={() => setVisible((count) => count + 100)}>Load next 100 of {filtered.length - visible}</button> : null}
      </div> : <p className="rounded-lg bg-zinc-50 p-4 text-sm text-zinc-500 dark:bg-zinc-800">No changes match the selected snapshots and filters.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="chip text-xs" onClick={() => { setFromIndex(Math.max(0, toIndex - 1)); setToIndex(Math.max(0, toIndex - 1)); }}>Previous checkpoint</button>
        <button type="button" className="chip text-xs" onClick={() => { setFromIndex(toIndex); setToIndex(Math.min(source.snapshots.length - 1, toIndex + 1)); }}>Next checkpoint</button>
      </div>
    </section>
  );
}
