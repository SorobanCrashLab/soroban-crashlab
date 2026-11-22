"use client";

import { useState } from 'react';
import Link from 'next/link';
import { METRIC_LABELS, toGeoJson, toTopologyJson, type TopoNode } from '@/lib/topology/normalize';
import { useGeoTopology } from './hooks/useGeoTopology';
import GeoMapView, { HEALTH_COLOR } from './map/GeoMapView';
import TopologyGraphView from './topology/TopologyGraphView';
import OverlayControls from './layers/OverlayControls';
import TimelinePlayback from './TimelinePlayback';

function download(name: string, text: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function GeoTopologyExplorer({ role = 'viewer' }: { role?: 'viewer' | 'responder' | 'maintainer' }) {
  const { frames, frame, index, privacy, loading, error, state, update } = useGeoTopology(role);
  const [copied, setCopied] = useState(false);
  const [showTable, setShowTable] = useState(false);

  if (loading) return <p role="status" className="text-sm text-zinc-500">Loading topology…</p>;
  if (error || !frame) return <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error ?? 'No topology data'}</p>;

  const regions = Array.from(new Set(frames.flatMap((f) => f.nodes.map((n) => n.region)))).sort();
  const selected: TopoNode | undefined = frame.nodes.find((n) => n.id === state.selectedId);
  const unhealthy = frame.nodes.filter((n) => n.health !== 'healthy').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="View" className="flex gap-1">
          {(['map', 'topology'] as const).map((v) => (
            <button key={v} role="tab" aria-selected={state.view === v} onClick={() => update({ view: v })} className={`rounded px-3 py-1.5 text-sm font-medium ${state.view === v ? 'bg-blue-600 text-white' : 'border border-zinc-300 dark:border-zinc-700'}`}>
              {v === 'map' ? 'Geo map' : 'Topology'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded px-2 py-0.5 ${privacy === 'strict' ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100' : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100'}`} title={privacy === 'strict' ? 'Locations are coarsened and names masked' : 'Full detail (maintainer)'}>
            Privacy: {privacy}
          </span>
          <span>{frame.nodes.length} nodes · {unhealthy} unhealthy</span>
          <button type="button" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable} className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700">{showTable ? 'Hide table' : 'Table view'}</button>
          <button type="button" onClick={() => download('topology.json', toTopologyJson(frame), 'application/json')} className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700">Export topology JSON</button>
          <button type="button" onClick={() => download('nodes.geojson', JSON.stringify(toGeoJson(frame), null, 2), 'application/geo+json')} className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700">Export GeoJSON</button>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard?.writeText(window.location.href);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700"
          >
            {copied ? 'Link copied' : 'Copy share link'}
          </button>
        </div>
      </div>

      <OverlayControls layer={state.layer} onLayer={(layer) => update({ layer })} filters={state.filters} onFilters={(filters) => update({ filters })} regions={regions} />
      <TimelinePlayback timestamps={frames.map((f) => f.t)} index={index} onIndex={(i) => update({ frameIndex: i })} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div>
          {state.view === 'map' ? (
            <GeoMapView frame={frame} layer={state.layer} selectedId={state.selectedId} onSelect={(id) => update({ selectedId: id })} />
          ) : (
            <TopologyGraphView frame={frame} selectedId={state.selectedId} onSelect={(id) => update({ selectedId: id })} />
          )}
        </div>
        <aside aria-label="Selection details" className="space-y-2 rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
          {selected ? (
            <>
              <h2 className="font-semibold">{selected.label}</h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-300">{selected.kind} · {selected.region} · {selected.network} · <span style={{ color: HEALTH_COLOR[selected.health] }}>{selected.health}</span></p>
              <dl className="grid grid-cols-2 gap-x-2 text-xs">
                {Object.entries(selected.metrics).map(([k, v]) => (
                  <div key={k} className="contents"><dt className="text-zinc-500">{METRIC_LABELS[k as keyof typeof METRIC_LABELS]}</dt><dd className="font-mono">{Number(v).toFixed(2)}</dd></div>
                ))}
              </dl>
              <div className="flex flex-col gap-1 pt-1 text-xs">
                <Link className="text-blue-700 hover:underline dark:text-blue-300" href={`/triage`}>Open triage board</Link>
                <Link className="text-blue-700 hover:underline dark:text-blue-300" href={`/runbooks?source=incident&ref=${encodeURIComponent(selected.id)}`}>Start a runbook for this node</Link>
              </div>
            </>
          ) : (
            <p className="text-zinc-500">Select a node or marker to see details and drill down.</p>
          )}
        </aside>
      </div>

      {showTable && (
        <div className="max-h-80 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Nodes in the current time window</caption>
            <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-900">
              <tr>{['Node', 'Type', 'Region', 'Health', METRIC_LABELS[state.layer]].map((h) => (<th key={h} scope="col" className="px-2 py-1">{h}</th>))}</tr>
            </thead>
            <tbody>
              {frame.nodes.map((n) => (
                <tr key={n.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <th scope="row" className="px-2 py-1 font-normal"><button type="button" className="text-blue-700 hover:underline dark:text-blue-300" onClick={() => update({ selectedId: n.id })}>{n.label}</button></th>
                  <td className="px-2 py-1">{n.kind}</td><td className="px-2 py-1">{n.region}</td><td className="px-2 py-1">{n.health}</td>
                  <td className="px-2 py-1 font-mono">{n.metrics[state.layer].toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
