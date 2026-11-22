'use client';

import { useState } from 'react';
import { useStateInspector } from './hooks/useStateInspector';
import StateTimeline from './timeline/StateTimeline';
import StateDiffViewer from './diff/StateDiffViewer';
import KeyWatchlist from './watchlist/KeyWatchlist';
import StateEventLinks from './correlation/StateEventLinks';

export default function StateTimelineInspector({ runId }: { runId: string }) {
  const inspector = useStateInspector(runId);
  const [selected, setSelected] = useState(0);
  if (inspector.loading) return <div className="space-y-3" role="status"><div className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" /><div className="h-64 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" /><span className="sr-only">Loading state timeline</span></div>;
  if (inspector.error || !inspector.data) return <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-5 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"><h2 className="font-semibold">State history could not be loaded</h2><p className="mt-1">{inspector.error ?? 'No state data returned.'}</p><button type="button" className="mt-3 underline" onClick={() => window.location.reload()}>Retry</button></div>;
  const { data } = inspector;
  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div><div className="flex items-center gap-2"><h2 className="font-semibold">Data quality</h2><span className={`rounded-full px-2 py-1 text-xs font-semibold ${data.quality.status === 'complete' ? 'bg-emerald-100 text-emerald-800' : data.quality.status === 'partial' ? 'bg-amber-100 text-amber-900' : 'bg-zinc-100 text-zinc-600'}`}>{data.quality.status}</span></div><p className="mt-1 max-w-3xl text-sm text-zinc-500">{data.quality.message}</p><p className="mt-1 text-xs text-zinc-500">{data.quality.artifactCount} parsed artifact(s) · {data.snapshots.length} snapshots · {data.mutations.length} mutations</p></div>
        <div className="min-w-64"><label className="block text-xs font-medium text-zinc-500" htmlFor="compare-run-id">Compare with another run</label><div className="mt-1 flex gap-2"><input id="compare-run-id" value={inspector.compareRunId} onChange={(event) => inspector.setCompareRunId(event.target.value)} placeholder="e.g. run-1024" className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" /><button type="button" disabled={inspector.compareLoading} onClick={inspector.compareWithRun} className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold disabled:opacity-50 dark:border-zinc-700">{inspector.compareLoading ? 'Loading…' : 'Compare'}</button></div>{inspector.compareError ? <p role="alert" className="mt-1 text-xs text-red-600">{inspector.compareError}</p> : null}{inspector.comparison ? <button type="button" className="mt-1 text-xs underline" onClick={inspector.clearComparison}>Clear comparison ({inspector.comparison.runId})</button> : null}</div>
      </section>
      <StateTimeline snapshots={data.snapshots} selectedIndex={selected} onSelect={setSelected} />
      {data.snapshots.length > 1 ? <StateDiffViewer key={data.runId} data={data} comparison={inspector.comparison} /> : null}
      <div className="grid gap-5 lg:grid-cols-2"><KeyWatchlist runId={runId} mutations={data.mutations} /><StateEventLinks runId={runId} mutations={data.mutations} /></div>
      <p className="text-xs text-zinc-500">Sensitive-looking fields are redacted before reaching the browser. Missing or partial snapshots are labelled; absence of an event is not treated as proof that a key stayed unchanged.</p>
    </div>
  );
}
