'use client';

import React from 'react';
import { ReleaseGate } from './hooks/useReleaseReadiness';

interface GateMatrixProps {
  gates: ReleaseGate[];
  onWaiveGate: (gateId: string, reason: string) => void;
}

export function GateMatrix({ gates, onWaiveGate }: GateMatrixProps) {
  return (
    <section aria-label="Release Gate Matrix" className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-4">
      <h2 className="mb-3 text-sm font-semibold text-zinc-100">Go/No-Go Gate Matrix</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-zinc-800 text-zinc-400">
            <tr>
              <th className="py-2 pr-3">Gate</th>
              <th className="py-2 pr-3">Req</th>
              <th className="py-2 pr-3">Threshold</th>
              <th className="py-2 pr-3">Actual</th>
              <th className="py-2 pr-3">Owner</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {gates.map((gate) => (
              <tr key={gate.id}>
                <td className="py-2.5 pr-3 font-medium text-zinc-200">{gate.name}</td>
                <td className="py-2.5 pr-3 text-zinc-400">{gate.required ? 'Required' : 'Optional'}</td>
                <td className="py-2.5 pr-3 font-mono text-zinc-300">{gate.threshold}</td>
                <td className="py-2.5 pr-3 font-mono text-zinc-300">{gate.actual}</td>
                <td className="py-2.5 pr-3 text-zinc-400">{gate.owner}</td>
                <td className="py-2.5 pr-3">
                  <span
                    className={`rounded px-2 py-0.5 font-semibold uppercase ${
                      gate.status === 'pass'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : gate.status === 'fail'
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {gate.status}
                  </span>
                </td>
                <td className="py-2.5">
                  {gate.status === 'fail' && (
                    <button
                      type="button"
                      onClick={() => onWaiveGate(gate.id, 'Time-bound waiver approved by Release Manager')}
                      className="rounded border border-amber-500/40 px-2 py-0.5 text-amber-300 hover:bg-amber-500/10"
                    >
                      Waive
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
