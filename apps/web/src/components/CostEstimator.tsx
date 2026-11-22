'use client';

import { useMemo } from 'react';
import { FuzzingRun } from '../app/types';

export function CostEstimator({ runs }: { runs: FuzzingRun[] }) {
  const stats = useMemo(() => {
    if (runs.length === 0) return null;
    const avgFee = runs.reduce((sum, r) => sum + (r.minResourceFee ?? 0), 0) / runs.length;
    const medianFee = [...runs].sort((a, b) => (a.minResourceFee ?? 0) - (b.minResourceFee ?? 0))[Math.floor(runs.length / 2)]?.minResourceFee ?? 0;
    return { avgFee, medianFee, total: runs.length };
  }, [runs]);

  if (!stats) return null;

  return (
    <div className="card card-padding">
      <h3 className="font-semibold text-sm">Cost Estimator</h3>
      <p className="text-meta text-xs mt-1">Projected from {stats.total} historical runs</p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div><span className="text-meta">Avg fee:</span> {Math.round(stats.avgFee).toLocaleString()} stroops</div>
        <div><span className="text-meta">Median fee:</span> {stats.medianFee.toLocaleString()} stroops</div>
        <div><span className="text-meta">Est. 100 runs:</span> {Math.round(stats.avgFee * 100).toLocaleString()} stroops</div>
        <div><span className="text-meta">Est. 1000 runs:</span> {Math.round(stats.avgFee * 1000).toLocaleString()} stroops</div>
      </div>
    </div>
  );
}
