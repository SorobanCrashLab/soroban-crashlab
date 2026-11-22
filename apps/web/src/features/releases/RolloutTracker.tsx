'use client';

import React from 'react';
import { RolloutPhase } from './hooks/useReleaseReadiness';

interface RolloutTrackerProps {
  phases: RolloutPhase[];
  onRollback: (phaseId: string) => void;
}

export function RolloutTracker({ phases, onRollback }: RolloutTrackerProps) {
  return (
    <section aria-label="Rollout Tracker" className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-4">
      <h2 className="mb-3 text-sm font-semibold text-zinc-100">Rollout & Canary Guardrails</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {phases.map((phase) => (
          <div key={phase.id} className="rounded border border-zinc-800 bg-zinc-900/50 p-3 text-xs">
            <div className="flex items-center justify-between font-semibold text-zinc-200">
              <span className="uppercase">{phase.environment}</span>
              <span
                className={
                  phase.status === 'rolled_back'
                    ? 'text-rose-400'
                    : phase.guardrailHealthy
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                }
              >
                {phase.status}
              </span>
            </div>
            <div className="mt-2 space-y-1 text-zinc-400">
              <div>Error Rate: {phase.errorRatePct}%</div>
              <div>P95 Latency: {phase.p95LatencyMs}ms</div>
            </div>
            {!phase.guardrailHealthy && phase.status === 'active' && (
              <button
                type="button"
                onClick={() => onRollback(phase.id)}
                className="mt-3 w-full rounded bg-rose-600 px-2 py-1 font-medium text-white hover:bg-rose-500"
              >
                Trigger Rollback
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
