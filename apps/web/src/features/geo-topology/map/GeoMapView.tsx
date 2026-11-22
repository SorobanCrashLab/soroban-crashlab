"use client";

import { useMemo, useState } from 'react';
import { clusterNodes, project, unlocatedNodes } from '@/lib/topology/clustering';
import { METRIC_LABELS, type Health, type MetricLayer, type TopologyFrame } from '@/lib/topology/normalize';

export const HEALTH_COLOR: Record<Health, string> = { healthy: '#059669', degraded: '#d97706', down: '#dc2626' };
const W = 800;
const H = 400;

/**
 * Offline-safe geo map: an equirectangular SVG with a graticule (no tile
 * server, so it works low-bandwidth). Nodes are grid-clustered by zoom; marker
 * radius encodes the selected metric and the ring colour encodes worst health.
 */
export default function GeoMapView({
  frame,
  layer,
  selectedId,
  onSelect,
}: {
  frame: TopologyFrame;
  layer: MetricLayer;
  selectedId: string | null;
  onSelect: (nodeId: string | null) => void;
}) {
  const [zoom, setZoom] = useState(2);
  const clusters = useMemo(() => clusterNodes(frame.nodes, zoom, layer), [frame.nodes, zoom, layer]);
  const max = Math.max(...clusters.map((c) => c.value), 1e-9);
  const missing = unlocatedNodes(frame.nodes);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <button type="button" onClick={() => setZoom((z) => Math.max(1, z - 1))} aria-label="Zoom out" className="rounded border px-2 py-0.5">−</button>
        <span aria-live="polite">Zoom {zoom}</span>
        <button type="button" onClick={() => setZoom((z) => Math.min(8, z + 1))} aria-label="Zoom in" className="rounded border px-2 py-0.5">+</button>
        <span className="text-zinc-500">{clusters.length} markers · size = {METRIC_LABELS[layer]}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Geographic map of nodes" className="w-full rounded-md border border-zinc-200 bg-sky-50 dark:border-zinc-800 dark:bg-slate-900">
        {[-60, -30, 0, 30, 60].map((lat) => {
          const y = project(lat, 0, W, H).y;
          return <line key={`lat${lat}`} x1={0} x2={W} y1={y} y2={y} stroke="currentColor" opacity={0.1} />;
        })}
        {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lon) => {
          const x = project(0, lon, W, H).x;
          return <line key={`lon${lon}`} x1={x} x2={x} y1={0} y2={H} stroke="currentColor" opacity={0.1} />;
        })}
        {clusters.map((c) => {
          const { x, y } = project(c.lat, c.lon, W, H);
          const r = 6 + (c.value / max) * 16 + Math.min(c.count, 20) * 0.3;
          const selected = c.nodeIds.includes(selectedId ?? '');
          return (
            <g
              key={c.id}
              tabIndex={0}
              role="button"
              aria-label={`${c.count} node${c.count === 1 ? '' : 's'}, worst health ${c.health}, ${METRIC_LABELS[layer]} ${c.value.toFixed(2)}`}
              onClick={() => (c.count === 1 ? onSelect(c.nodeIds[0]) : setZoom((z) => Math.min(8, z + 2)))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (c.count === 1) onSelect(c.nodeIds[0]);
                  else setZoom((z) => Math.min(8, z + 2));
                }
              }}
              className="cursor-pointer focus-visible:outline"
            >
              <circle cx={x} cy={y} r={r} fill={HEALTH_COLOR[c.health]} opacity={0.35} stroke={HEALTH_COLOR[c.health]} strokeWidth={selected ? 4 : 2} />
              {c.count > 1 && (
                <text x={x} y={y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor">{c.count}</text>
              )}
            </g>
          );
        })}
      </svg>
      {missing.length > 0 && (
        <p className="text-xs text-zinc-500">{missing.length} node(s) without a location are hidden from the map; see the topology view or table.</p>
      )}
    </div>
  );
}
