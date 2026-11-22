"use client";

import type { CorrelationLink } from '@/lib/correlation/model';

/** Explainable suggestions: confidence meter, rationale, confirm/reject. */
export default function SuggestionPanel({
  suggestions,
  canWrite,
  onDecide,
  onSelect,
}: {
  suggestions: CorrelationLink[];
  canWrite: boolean;
  onDecide: (link: CorrelationLink, decision: 'confirm' | 'reject') => void;
  onSelect: (id: string) => void;
}) {
  if (suggestions.length === 0) return <p className="text-sm text-zinc-500">No suggestions. Everything related has been reviewed.</p>;
  return (
    <ul aria-label="Suggested correlations" className="space-y-2">
      {suggestions.map((s) => {
        const pct = Math.round(s.confidence * 100);
        return (
          <li key={s.id} className="space-y-1.5 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
            <div className="flex items-center justify-between gap-2">
              <span>
                <button type="button" className="font-medium text-blue-700 hover:underline dark:text-blue-300" onClick={() => onSelect(s.from)}>{s.from}</button>
                {' ↔ '}
                <button type="button" className="font-medium text-blue-700 hover:underline dark:text-blue-300" onClick={() => onSelect(s.to)}>{s.to}</button>
              </span>
              <span className="font-mono text-xs">{pct}%</span>
            </div>
            <div role="meter" aria-label="Confidence" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-1.5 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
              <div className={`h-full ${pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-zinc-500'}`} style={{ width: `${pct}%` }} />
            </div>
            <ul className="list-disc pl-5 text-xs text-zinc-600 dark:text-zinc-300">
              {s.rationale.map((r) => (<li key={r}>{r}</li>))}
            </ul>
            {canWrite && (
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => onDecide(s, 'confirm')} className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700">Confirm</button>
                <button type="button" onClick={() => onDecide(s, 'reject')} className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">Reject</button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
