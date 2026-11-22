"use client";

import { useMemo } from 'react';
import { ARTIFACT_TYPES, type CorrelationArtifact, type CorrelationLink } from '@/lib/correlation/model';

const W = 900;
const H = 420;
const COLORS: Record<string, string> = {
  run: '#2563eb', trace: '#7c3aed', log: '#0d9488', state_diff: '#c2410c',
  artifact: '#4b5563', reproducer: '#be123c', issue: '#16a34a', incident: '#dc2626',
};

/**
 * Typed-column graph: artifacts are placed in a column per type and ordered by
 * time so the layout is stable. Solid lines are confirmed/manual links, dashed
 * lines are suggestions (opacity = confidence).
 */
export default function CorrelationGraph({
  artifacts,
  links,
  suggestions,
  selectedId,
  neighborIds,
  onSelect,
}: {
  artifacts: CorrelationArtifact[];
  links: CorrelationLink[];
  suggestions: CorrelationLink[];
  selectedId: string | null;
  neighborIds: Set<string>;
  onSelect: (id: string) => void;
}) {
  const positions = useMemo(() => {
    const types = ARTIFACT_TYPES.filter((t) => artifacts.some((a) => a.type === t));
    const map = new Map<string, { x: number; y: number }>();
    types.forEach((type, col) => {
      const items = artifacts.filter((a) => a.type === type).sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
      items.forEach((a, i) => {
        map.set(a.id, {
          x: 60 + (types.length === 1 ? 0.5 : col / (types.length - 1)) * (W - 120),
          y: 40 + ((i + 1) / (items.length + 1)) * (H - 80),
        });
      });
    });
    return map;
  }, [artifacts]);

  const draw = (l: CorrelationLink, dashed: boolean) => {
    const a = positions.get(l.from);
    const b = positions.get(l.to);
    if (!a || !b) return null;
    const hot = selectedId !== null && (l.from === selectedId || l.to === selectedId);
    return (
      <line
        key={`${dashed ? 's' : 'l'}-${l.id}`}
        x1={a.x} y1={a.y} x2={b.x} y2={b.y}
        stroke={hot ? '#2563eb' : 'currentColor'}
        strokeOpacity={dashed ? 0.25 + l.confidence * 0.6 : 0.7}
        strokeWidth={hot ? 2.5 : 1.5}
        strokeDasharray={dashed ? '5 4' : undefined}
      >
        <title>{`${l.from} ↔ ${l.to} (${Math.round(l.confidence * 100)}%): ${l.rationale.join('; ')}`}</title>
      </line>
    );
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Correlation graph" className="w-full rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      {links.filter((l) => l.status !== 'rejected').map((l) => draw(l, false))}
      {suggestions.map((l) => draw(l, true))}
      {artifacts.map((a) => {
        const p = positions.get(a.id);
        if (!p) return null;
        const selected = a.id === selectedId;
        return (
          <g
            key={a.id}
            tabIndex={0}
            role="button"
            aria-pressed={selected}
            aria-label={`${a.type} ${a.title}${neighborIds.has(a.id) ? ', related to selection' : ''}`}
            onClick={() => onSelect(a.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(a.id);
              }
            }}
            className="cursor-pointer focus-visible:outline"
          >
            <circle cx={p.x} cy={p.y} r={selected ? 12 : 9} fill={COLORS[a.type]} opacity={selectedId && !selected && !neighborIds.has(a.id) ? 0.3 : 1} stroke={selected ? '#2563eb' : 'none'} strokeWidth={3} />
            <text x={p.x} y={p.y - 14} textAnchor="middle" fontSize="9" fill="currentColor">{a.id}</text>
          </g>
        );
      })}
    </svg>
  );
}
