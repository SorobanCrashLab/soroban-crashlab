"use client";

import { METRIC_LABELS, METRIC_LAYERS, type Health, type MetricLayer, type NodeKind, type TopologyFilters } from '@/lib/topology/normalize';

const KINDS: NodeKind[] = ['runner', 'rpc', 'contract', 'dependency'];
const HEALTH: Health[] = ['healthy', 'degraded', 'down'];

function toggle<T>(list: T[] | undefined, v: T): T[] {
  const cur = list ?? [];
  return cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
}

export default function OverlayControls({
  layer,
  onLayer,
  filters,
  onFilters,
  regions,
}: {
  layer: MetricLayer;
  onLayer: (l: MetricLayer) => void;
  filters: TopologyFilters;
  onFilters: (f: TopologyFilters) => void;
  regions: string[];
}) {
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs ${active ? 'border-blue-600 bg-blue-600 text-white' : 'border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800'}`;
  return (
    <section aria-label="Overlay and filters" className="space-y-3 text-sm">
      <label className="flex items-center gap-2">
        Data layer
        <select value={layer} onChange={(e) => onLayer(e.target.value as MetricLayer)} className="rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700">
          {METRIC_LAYERS.map((l) => (<option key={l} value={l}>{METRIC_LABELS[l]}</option>))}
        </select>
      </label>
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="mb-1 text-xs font-semibold uppercase text-zinc-500">Type</legend>
        {KINDS.map((k) => (
          <button key={k} type="button" aria-pressed={filters.kinds?.includes(k) ?? false} onClick={() => onFilters({ ...filters, kinds: toggle(filters.kinds, k) })} className={chip(filters.kinds?.includes(k) ?? false)}>{k}</button>
        ))}
      </fieldset>
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="mb-1 text-xs font-semibold uppercase text-zinc-500">Health</legend>
        {HEALTH.map((h) => (
          <button key={h} type="button" aria-pressed={filters.health?.includes(h) ?? false} onClick={() => onFilters({ ...filters, health: toggle(filters.health, h) })} className={chip(filters.health?.includes(h) ?? false)}>{h}</button>
        ))}
      </fieldset>
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="mb-1 text-xs font-semibold uppercase text-zinc-500">Region</legend>
        {regions.map((r) => (
          <button key={r} type="button" aria-pressed={filters.regions?.includes(r) ?? false} onClick={() => onFilters({ ...filters, regions: toggle(filters.regions, r) })} className={chip(filters.regions?.includes(r) ?? false)}>{r}</button>
        ))}
      </fieldset>
    </section>
  );
}
