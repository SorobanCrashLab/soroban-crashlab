'use client';

import { useMemo, useState } from 'react';
import { MOCK_MATRIX_NETWORKS, buildMatrixRows, computeDivergenceReport } from './environment-matrix-utils';
import { buildMockRuns } from '../../mockRuns';

export default function EnvironmentMatrixPage() {
  const runs = useMemo(() => buildMockRuns().slice(0, 8), []);
  const [rows] = useState(() => buildMatrixRows(runs.map((r) => r.id)));
  const report = useMemo(() => computeDivergenceReport(rows), [rows]);

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">Environment Matrix Runner</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
          Same runs across mock network configs. Divergences highlight environment-sensitive crashes.
        </p>

        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/30 mb-6 flex flex-wrap gap-4 text-sm">
          <span className="font-medium">Total: {report.total}</span>
          <span className={report.diverged > 0 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-emerald-600'}>
            Diverged: {report.diverged}
          </span>
          {report.divergedIds.length > 0 && (
            <span className="text-zinc-500">IDs: {report.divergedIds.join(', ')}</span>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Run</th>
                {MOCK_MATRIX_NETWORKS.map((net) => (
                  <th key={net.id} className="px-4 py-3 text-left font-semibold">
                    {net.name}
                    <span className="block text-xs font-normal text-zinc-500">{net.id}</span>
                  </th>
                ))}
                <th className="px-4 py-3 text-left font-semibold">Diverged</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-950">
              {rows.map((row) => (
                <tr key={row.runId} className={row.diverged ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}>
                  <td className="px-4 py-3 font-mono text-xs">{row.runId}</td>
                  {MOCK_MATRIX_NETWORKS.map((net) => {
                    const res = row.results[net.id];
                    return (
                      <td key={net.id} className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${res.status === 'failed' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' : res.status === 'running' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>
                          {res.status}
                        </span>
                        <span className="ml-2 text-xs text-zinc-500">{res.durationMs}ms</span>
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-xs font-semibold">
                    {row.diverged ? <span className="text-amber-600 dark:text-amber-400">Yes</span> : <span className="text-zinc-500">No</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
