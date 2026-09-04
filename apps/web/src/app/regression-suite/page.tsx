'use client';

import { useMemo, useState } from 'react';
import { buildMockRuns } from '../mockRuns';
import {
  buildMatrixCsv,
  createLocalSuiteGateway,
  createSuite,
  deterministicMockReplay,
  executeSuite,
  filterMatrix,
  type MatrixFilter,
  type MatrixResult,
  type RegressionSuite,
  saveSuite,
} from '../regression-suite-utils';

const ROW_HEIGHT = 52;
const VIEWPORT_HEIGHT = 520;

const labels: Record<MatrixResult['status'], string> = {
  passed: 'Still passing', failed: 'Still failing', regression: 'Regression', 'regressed-fix': 'Fixed', 'never-ran': 'Never ran',
};

export default function RegressionSuitePage() {
  const runs = useMemo(() => buildMockRuns(), []);
  const gateway = useMemo(() => createLocalSuiteGateway(), []);
  const [suite, setSuite] = useState<RegressionSuite | null>(() => gateway.list()[0] ?? null);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<MatrixResult[]>([]);
  const [filter, setFilter] = useState<MatrixFilter>('all');
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [details, setDetails] = useState<MatrixResult | null>(null);

  const visibleResults = filterMatrix(results, filter);
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 3);
  const last = Math.min(visibleResults.length, Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + 3);

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const create = () => {
    try {
      const chosen = runs.filter((run) => selected.has(run.id));
      const next = createSuite(`suite-${Date.now()}`, name, chosen);
      saveSuite(gateway, next);
      setSuite(next); setResults([]); setError(null); setName('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create suite'); }
  };

  const execute = async () => {
    if (!suite) return;
    setRunning(true); setError(null);
    try {
      const next = await executeSuite(suite, (id) => runs.find((run) => run.id === id), deterministicMockReplay({}));
      setResults(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Suite execution failed'); }
    finally { setRunning(false); }
  };

  return <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] p-4 md:p-8">
    <div className="mx-auto max-w-6xl space-y-6">
      <header><h1 className="text-3xl font-bold">Regression Suite Composer</h1><p className="text-sm text-zinc-600 dark:text-zinc-400">Save historical runs and compare deterministic replays against their captured outcomes.</p></header>
      <section className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-[var(--surface)] p-5" aria-labelledby="compose-heading">
        <h2 id="compose-heading" className="mb-4 text-lg font-semibold">Create a suite</h2>
        <div className="flex flex-wrap gap-3"><label className="sr-only" htmlFor="suite-name">Suite name</label><input id="suite-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Suite name" className="rounded-lg border px-3 py-2 text-sm bg-transparent" /><button type="button" onClick={create} disabled={selected.size === 0 || !name.trim()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Save {selected.size} selected runs</button></div>
        <div className="mt-4 grid max-h-56 grid-cols-1 gap-2 overflow-auto md:grid-cols-3">{runs.map((run) => <label key={run.id} className="flex items-center gap-2 rounded border border-zinc-200 p-2 text-sm dark:border-zinc-700"><input type="checkbox" checked={selected.has(run.id)} onChange={() => toggle(run.id)} /> <span className="font-mono">{run.id}</span><span className="text-zinc-500">{run.status}</span></label>)}</div>
        {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </section>
      {suite && <section className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-[var(--surface)] p-5" aria-labelledby="matrix-heading">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="matrix-heading" className="text-lg font-semibold">{suite.name}</h2><p className="text-sm text-zinc-500">{suite.members.length} members</p></div><div className="flex gap-2"><button type="button" onClick={execute} disabled={running} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{running ? 'Running…' : 'Run suite'}</button><button type="button" disabled={!results.length} onClick={() => { const blob = new Blob([buildMatrixCsv(results)], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${suite.name}.csv`; link.click(); URL.revokeObjectURL(url); }} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">Export CSV</button></div></div>
        <div className="my-4 flex flex-wrap gap-2" role="group" aria-label="Matrix status filter">{(['all', 'passed', 'failed', 'regression', 'regressed-fix', 'never-ran'] as MatrixFilter[]).map((item) => <button type="button" key={item} onClick={() => setFilter(item)} aria-pressed={filter === item} className="rounded-full border px-3 py-1 text-xs capitalize">{item}</button>)}</div>
        {!results.length ? <p className="rounded-lg border border-dashed p-10 text-center text-sm text-zinc-500">Run this suite to populate the pass/fail matrix.</p> : <div className="overflow-hidden rounded-lg border"><div className="overflow-y-auto" style={{ height: VIEWPORT_HEIGHT }} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)} role="region" aria-label={`${visibleResults.length} matrix results`}><div style={{ height: visibleResults.length * ROW_HEIGHT, position: 'relative' }}>{visibleResults.slice(first, last).map((result, index) => { const top = (first + index) * ROW_HEIGHT; return <button type="button" key={result.runId} onClick={() => setDetails(result)} className="absolute left-0 flex w-full items-center gap-4 border-b px-4 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/40" style={{ top, height: ROW_HEIGHT }}><span className="w-36 font-mono text-sm">{result.runId}</span><span className="w-24 text-sm">{result.originalOutcome}</span><span className="w-24 text-sm">{result.currentOutcome ?? '—'}</span><span className="font-medium" aria-label={labels[result.status]}>{result.status === 'regression' ? '⚠ ' : result.status === 'regressed-fix' ? '✓ ' : ''}{labels[result.status]}</span></button>; })}</div></div></div>}
      </section>}
      {details && <dialog open className="fixed inset-0 m-auto max-w-xl rounded-xl border bg-[var(--surface)] p-6 text-[var(--text)] shadow-xl"><h2 className="text-lg font-semibold">{details.runId} differences</h2><p className="mt-2 text-sm">Original: <strong>{details.originalOutcome}</strong> · Current: <strong>{details.currentOutcome ?? 'not available'}</strong></p><p className="mt-3 whitespace-pre-wrap rounded border p-3 text-sm">{details.error ?? 'Replay outcome changed according to the suite comparison.'}</p><button type="button" onClick={() => setDetails(null)} className="mt-4 rounded border px-4 py-2 text-sm">Close</button></dialog>}
    </div>
  </main>;
}
