'use client';

import { useEffect, useMemo, useState } from 'react';
import type { StateMutation } from '@/lib/state/normalizeSnapshots';

interface Props { mutations: StateMutation[]; runId: string }

export default function KeyWatchlist({ mutations, runId }: Props) {
  const storageKey = `crashlab:state-watchlist:${runId}`;
  const [keys, setKeys] = useState<string[]>([]);
  const [candidate, setCandidate] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try { setKeys(JSON.parse(localStorage.getItem(storageKey) ?? '[]') as string[]); } catch { setKeys([]); }
    setReady(true);
  }, [storageKey]);
  useEffect(() => {
    if (ready) localStorage.setItem(storageKey, JSON.stringify(keys));
  }, [keys, ready, storageKey]);
  const alerts = useMemo(() => mutations.filter((mutation) => keys.includes(mutation.key)), [keys, mutations]);
  const add = (key: string) => {
    const value = key.trim();
    if (value && !keys.includes(value)) setKeys((previous) => [...previous, value].sort());
    setCandidate('');
  };
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Key watchlist</h2><p className="text-xs text-zinc-500">Pins are saved in this browser for this run.</p></div><span className="chip text-xs">{alerts.length} watched mutations</span></div>
      <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); add(candidate); }}>
        <input value={candidate} onChange={(event) => setCandidate(event.target.value)} list="state-key-options" placeholder="Pin a storage key" aria-label="Storage key to watch" className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" />
        <datalist id="state-key-options">{[...new Set(mutations.map((item) => item.key))].map((key) => <option key={key} value={key} />)}</datalist>
        <button type="submit" className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">Pin key</button>
      </form>
      {keys.length ? <ul className="mt-3 space-y-2">{keys.map((key) => <li key={key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-50 p-2 text-xs dark:bg-zinc-800"><span className="break-all font-mono">{key}</span><span className="flex items-center gap-2"><span className="text-zinc-500">{alerts.filter((item) => item.key === key).length} changes</span><button type="button" className="underline" onClick={() => setKeys((previous) => previous.filter((item) => item !== key))} aria-label={`Remove ${key} from watchlist`}>Remove</button></span></li>)}</ul> : <p className="mt-3 text-sm text-zinc-500">No pinned keys yet. Add a key to highlight every mutation that touches it.</p>}
      {alerts.length ? <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200" role="status">Watchlist alert: {alerts.length} state changes touched pinned keys.</p> : null}
    </section>
  );
}
