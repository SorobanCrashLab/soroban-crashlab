"use client";

import { useMemo, useState } from 'react';
import { ARTIFACT_TYPES, type ArtifactType, type CorrelationLink } from '@/lib/correlation/model';
import { neighborhood } from '@/lib/correlation/engine';
import { useCorrelation, type CorrelationIdentity } from './hooks/useCorrelation';
import CorrelationGraph from './CorrelationGraph';
import SuggestionPanel from './SuggestionPanel';
import InvestigationSets from './InvestigationSets';

function downloadJson(name: string, data: unknown) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function CorrelationWorkspace({ identity }: { identity: CorrelationIdentity }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [types, setTypes] = useState<ArtifactType[]>([]);
  const [minConfidence, setMinConfidence] = useState(0);
  const [view, setView] = useState<'graph' | 'list'>('graph');
  const { artifacts, links, sets, audit, suggestions, loading, error, act } = useCorrelation(identity, selectedId);
  const canWrite = identity.role !== 'viewer';

  const shown = useMemo(() => (types.length ? artifacts.filter((a) => types.includes(a.type)) : artifacts), [artifacts, types]);
  const shownIds = new Set(shown.map((a) => a.id));
  const visibleSuggestions = suggestions.filter((s) => s.confidence >= minConfidence && shownIds.has(s.from) && shownIds.has(s.to));
  const hood = useMemo(() => (selectedId ? neighborhood([...links, ...visibleSuggestions], selectedId, 2) : new Map<string, number>()), [links, visibleSuggestions, selectedId]);
  const selected = artifacts.find((a) => a.id === selectedId);
  const related = Array.from(hood.keys());

  if (loading) return <p role="status" className="text-sm text-zinc-500">Loading correlations…</p>;

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-100">{error}</p>}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <fieldset className="flex flex-wrap items-center gap-1">
          <legend className="sr-only">Artifact types</legend>
          {ARTIFACT_TYPES.filter((t) => artifacts.some((a) => a.type === t)).map((t) => (
            <button key={t} type="button" aria-pressed={types.includes(t)} onClick={() => setTypes((c) => (c.includes(t) ? c.filter((x) => x !== t) : [...c, t]))} className={`rounded-full border px-3 py-1 ${types.includes(t) ? 'border-blue-600 bg-blue-600 text-white' : 'border-zinc-300 dark:border-zinc-700'}`}>
              {t.replace('_', ' ')}
            </button>
          ))}
        </fieldset>
        <label className="flex items-center gap-2">
          Min confidence {Math.round(minConfidence * 100)}%
          <input type="range" min={0} max={1} step={0.05} value={minConfidence} onChange={(e) => setMinConfidence(Number(e.target.value))} aria-label="Minimum confidence" />
        </label>
        <div role="tablist" aria-label="View" className="ml-auto flex gap-1">
          {(['graph', 'list'] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`rounded px-3 py-1 ${view === v ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'border border-zinc-300 dark:border-zinc-700'}`}>{v}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          {view === 'graph' ? (
            <CorrelationGraph artifacts={shown} links={links} suggestions={visibleSuggestions} selectedId={selectedId} neighborIds={new Set(related)} onSelect={setSelectedId} />
          ) : (
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Artifacts and their links</caption>
              <thead className="bg-zinc-100 dark:bg-zinc-900"><tr><th scope="col" className="px-2 py-1">Artifact</th><th scope="col" className="px-2 py-1">Type</th><th scope="col" className="px-2 py-1">Linked to</th></tr></thead>
              <tbody>
                {shown.map((a) => (
                  <tr key={a.id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <th scope="row" className="px-2 py-1 font-normal"><button type="button" onClick={() => setSelectedId(a.id)} className="text-blue-700 hover:underline dark:text-blue-300">{a.title}</button></th>
                    <td className="px-2 py-1">{a.type.replace('_', ' ')}</td>
                    <td className="px-2 py-1">{[...links, ...visibleSuggestions].filter((l) => l.status !== 'rejected' && (l.from === a.id || l.to === a.id)).map((l) => (l.from === a.id ? l.to : l.from)).join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <section aria-label="Selected artifact" className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
            {selected ? (
              <>
                <h2 className="font-semibold">{selected.title}</h2>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 text-xs">
                  {([['Type', selected.type], ['Time', new Date(selected.timestamp).toLocaleString()], ['Run', selected.runId], ['Trace', selected.traceId], ['Signature', selected.signature], ['Commit', selected.commit], ['Env', selected.env]] as const)
                    .filter(([, v]) => v)
                    .map(([k, v]) => (<div key={k} className="contents"><dt className="text-zinc-500">{k}</dt><dd className="font-mono">{v}</dd></div>))}
                </dl>
                <p className="mt-2 text-xs text-zinc-500">Related within 2 hops: {related.filter((id) => id !== selected.id).join(', ') || 'none'}</p>
                {canWrite && (
                  <label className="mt-2 flex items-center gap-2 text-xs">
                    Link manually to
                    <select defaultValue="" onChange={(e) => { if (e.target.value) void act({ action: 'link', from: selected.id, to: e.target.value }); e.target.value = ''; }} className="rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700">
                      <option value="">choose…</option>
                      {artifacts.filter((a) => a.id !== selected.id).map((a) => (<option key={a.id} value={a.id}>{a.id}</option>))}
                    </select>
                  </label>
                )}
              </>
            ) : (
              <p className="text-zinc-500">Select an artifact to pivot: related evidence and its links appear here.</p>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <h2 className="text-sm font-semibold">Suggestions{selectedId ? ` for ${selectedId}` : ''}</h2>
          <SuggestionPanel
            suggestions={visibleSuggestions}
            canWrite={canWrite}
            onSelect={setSelectedId}
            onDecide={(link: CorrelationLink, decision) => void act({ action: decision, link })}
          />
          <h2 className="text-sm font-semibold">Investigation sets</h2>
          <InvestigationSets
            sets={sets}
            selection={related.length ? related : selectedId ? [selectedId] : []}
            canWrite={canWrite}
            onCreate={(name, artifactIds) => void act({ action: 'create_set', name, artifactIds, linkIds: links.filter((l) => artifactIds.includes(l.from) && artifactIds.includes(l.to)).map((l) => l.id) })}
            onExport={async (set) => {
              const data = await act({ action: 'bundle', id: set.id });
              if (data?.bundle) downloadJson(`${set.name.replace(/\W+/g, '-').toLowerCase()}-evidence.json`, data.bundle);
            }}
          />
          <details className="text-xs">
            <summary className="cursor-pointer font-medium">Audit trail ({audit.length})</summary>
            <ol className="mt-2 space-y-1">
              {audit.map((a, i) => (<li key={`${a.at}-${i}`}>{new Date(a.at).toLocaleTimeString()} · {a.actor} · {a.action.replace('_', ' ')} {a.linkId ?? a.setId ?? ''}</li>))}
            </ol>
          </details>
        </div>
      </div>
    </div>
  );
}
