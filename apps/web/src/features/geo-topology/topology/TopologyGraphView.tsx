"use client";

import { useMemo } from 'react';
import { layoutTopology } from '@/lib/topology/layout';
import { failurePropagation, type TopologyFrame } from '@/lib/topology/normalize';
import { HEALTH_COLOR } from '../map/GeoMapView';

const W = 900;
const H = 460;

/** Deterministic layered dependency graph with failure-propagation highlighting. */
export default function TopologyGraphView({
  frame,
  selectedId,
  onSelect,
}: {
  frame: TopologyFrame;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const positions = useMemo(() => layoutTopology(frame.nodes, frame.edges, { width: W, height: H }), [frame.nodes, frame.edges]);
  const pos = new Map(positions.map((p) => [p.id, p]));
  const downstream = useMemo(() => (selectedId ? failurePropagation(frame, selectedId) : new Set<string>()), [frame, selectedId]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Service topology graph" className="w-full rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" opacity={0.5} />
        </marker>
      </defs>
      {frame.edges.map((e) => {
        const a = pos.get(e.from);
        const b = pos.get(e.to);
        if (!a || !b) return null;
        const failing = e.failureRate >= 0.05;
        const propagating = failing && (e.from === selectedId || downstream.has(e.from));
        return (
          <line
            key={`${e.from}->${e.to}`}
            x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke={failing ? '#dc2626' : 'currentColor'}
            strokeOpacity={failing ? 0.9 : 0.25}
            strokeWidth={Math.min(1 + Math.log10(e.traffic + 1) * 1.2, 5)}
            strokeDasharray={propagating ? '6 4' : undefined}
            markerEnd="url(#arrow)"
          >
            <title>{`${e.from} → ${e.to}: ${Math.round(e.traffic)} req/min, ${(e.failureRate * 100).toFixed(1)}% failing`}</title>
          </line>
        );
      })}
      {positions.map((p) => {
        const node = frame.nodes.find((n) => n.id === p.id)!;
        const hit = downstream.has(p.id);
        return (
          <g
            key={p.id}
            tabIndex={0}
            role="button"
            aria-label={`${node.label}, ${node.kind}, ${node.health}${hit ? ', affected by failure propagation' : ''}`}
            onClick={() => onSelect(p.id === selectedId ? null : p.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(p.id === selectedId ? null : p.id);
              }
            }}
            className="cursor-pointer focus-visible:outline"
          >
            <circle cx={p.x} cy={p.y} r={node.kind === 'runner' ? 8 : 12} fill={HEALTH_COLOR[node.health]} stroke={p.id === selectedId ? '#2563eb' : hit ? '#dc2626' : 'none'} strokeWidth={3} />
            <text x={p.x} y={p.y - 16} textAnchor="middle" fontSize="9" fill="currentColor">{node.label}</text>
          </g>
        );
      })}
    </svg>
  );
}
