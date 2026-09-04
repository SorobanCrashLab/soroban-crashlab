'use client';

import { useMemo, useState } from 'react';
import { estimateCampaignCost, formatStroops } from './campaign-cost-estimator-utils';
import { buildMockRuns } from '../mockRuns';

export default function CampaignCostEstimator() {
  const mockRuns = useMemo(() => buildMockRuns(), []);
  const defaultAvg = useMemo(() => {
    if (mockRuns.length === 0) return 1500;
    return Math.round(mockRuns.reduce((s, r) => s + r.minResourceFee, 0) / mockRuns.length);
  }, [mockRuns]);
  const [runCount, setRunCount] = useState(200);
  const [avgFee, setAvgFee] = useState(defaultAvg);
  const [runsPerDay, setRunsPerDay] = useState(50);
  const estimate = useMemo(() => estimateCampaignCost(runCount, avgFee, runsPerDay), [runCount, avgFee, runsPerDay]);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Campaign Cost Estimator</h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Estimated fees based on run count × avg fee with burn-rate projection.</p>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Run count</span>
          <input type="number" value={runCount} onChange={(e) => setRunCount(Number(e.target.value) || 0)} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Avg fee (stroops)</span>
          <input type="number" value={avgFee} onChange={(e) => setAvgFee(Number(e.target.value) || 0)} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Runs / day</span>
          <input type="number" value={runsPerDay} onChange={(e) => setRunsPerDay(Number(e.target.value) || 0)} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
        </label>
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800">
          <div className="text-xs text-zinc-500">Total estimate</div>
          <div className="mt-1 text-sm font-semibold break-all">{formatStroops(estimate.totalStroops)}</div>
          <div className="text-xs text-zinc-500">{estimate.totalXlm.toFixed(6)} XLM</div>
        </div>
        <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800">
          <div className="text-xs text-zinc-500">Daily burn</div>
          <div className="mt-1 text-sm font-semibold">{formatStroops(estimate.dailyBurnStroops)}</div>
          <div className="text-xs text-zinc-500">{estimate.dailyBurnXlm.toFixed(6)} XLM / day</div>
        </div>
        <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800">
          <div className="text-xs text-zinc-500">7-day projection</div>
          <div className="mt-1 text-sm font-semibold">{formatStroops(estimate.projected7dStroops)}</div>
        </div>
        <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800">
          <div className="text-xs text-zinc-500">30-day projection</div>
          <div className="mt-1 text-sm font-semibold">{formatStroops(estimate.projected30dStroops)}</div>
        </div>
      </div>
    </div>
  );
}
