'use client';

import type { StateMutation } from '@/lib/state/normalizeSnapshots';

export default function StateEventLinks({ mutations, runId }: { mutations: StateMutation[]; runId: string }) {
  const [query, setQuery] = React.useState('');
  const visible = mutations.filter((item) => !query || `${item.key} ${item.contractId} ${item.actor ?? ''} ${item.callId ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Causal event correlation</h2><p className="text-xs text-zinc-500">Mutation origin, invocation and evidence links</p></div><span className="chip text-xs">{visible.length} events</span></div>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by key, contract, actor or call" aria-label="Filter correlated events" className="mt-3 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" />
      <ol className="mt-3 max-h-[32rem] space-y-2 overflow-y-auto">
        {visible.slice(0, 500).map((event) => <li key={event.id} className="rounded-lg border border-zinc-100 p-3 dark:border-zinc-800">
          <div className="flex flex-wrap items-center gap-2"><span className="rounded bg-zinc-100 px-2 py-1 text-xs font-semibold dark:bg-zinc-800">{event.changeType}</span><span className="text-xs text-zinc-500">{event.category}</span>{event.ledger !== undefined ? <span className="text-xs text-zinc-500">Ledger {event.ledger}</span> : null}</div>
          <p className="mt-2 break-all font-mono text-xs">{event.key}</p>
          <p className="mt-1 text-xs text-zinc-500">{event.contractId} · {event.namespace}{event.actor ? ` · ${event.actor}` : ''}{event.callId ? ` · call ${event.callId}` : ''}</p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            {event.traceNodeId ? <a className="underline" href={`/runs/${encodeURIComponent(runId)}/sequence#${encodeURIComponent(event.traceNodeId)}`}>Trace node {event.traceNodeId}</a> : null}
            {event.logId ? <a className="underline" href={`/runs/${encodeURIComponent(runId)}?log=${encodeURIComponent(event.logId)}`}>Log entry {event.logId}</a> : null}
            {!event.traceNodeId && !event.logId ? <span className="text-zinc-400">No trace/log reference in source artifact</span> : null}
          </div>
        </li>)}
      </ol>
      {!visible.length ? <p className="mt-3 text-sm text-zinc-500">No mutation events match this filter.</p> : null}
    </section>
  );
}

import React from 'react';
