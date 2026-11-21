"use client";

import { useMemo, useState } from "react";
import type { FuzzingRun } from "@/app/types";
import { COMPARISON_METRICS, formatMetricValue, formatDeltaPercent } from "../metrics";
import { aggregateCampaigns, compareAggregates } from "./AggregationEngine";

export interface CampaignComparisonModeProps {
  runs: FuzzingRun[];
}

export default function CampaignComparisonMode({ runs }: CampaignComparisonModeProps) {
  const aggregates = useMemo(() => aggregateCampaigns(runs), [runs]);
  const [baselineId, setBaselineId] = useState<string | null>(null);
  const baseline = aggregates.find((aggregate) => aggregate.campaignId === baselineId) ?? aggregates[0];

  if (aggregates.length === 0) {
    return (
      <section aria-label="Campaign comparison" className="rounded-2xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
        <h3 className="text-sm font-semibold">Campaign comparison</h3>
        <p className="mt-2 text-sm text-zinc-500">No runs are available for campaign aggregation.</p>
      </section>
    );
  }

  return (
    <section aria-label="Campaign comparison" className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold">Campaign aggregates</h3>
        <label htmlFor="campaign-baseline" className="text-xs text-zinc-500">Baseline</label>
        <select
          id="campaign-baseline"
          value={baseline?.campaignId ?? ""}
          onChange={(event) => setBaselineId(event.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        >
          {aggregates.map((aggregate) => (
            <option key={aggregate.campaignId} value={aggregate.campaignId}>
              {aggregate.campaignId} ({aggregate.runCount} runs)
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <caption className="sr-only">Campaign median, p95 and p99 aggregates</caption>
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th scope="col" className="px-2 py-2">Campaign</th>
              <th scope="col" className="px-2 py-2">Runs</th>
              {COMPARISON_METRICS.map((metric) => (
                <th key={metric.key} scope="col" className="px-2 py-2">{metric.label} p50 / p95 / p99</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {aggregates.map((aggregate) => {
              const deltas = baseline ? compareAggregates(baseline, aggregate) : {};
              return (
                <tr key={aggregate.campaignId} className="border-b border-zinc-100 dark:border-zinc-900">
                  <th scope="row" className="px-2 py-2 font-mono font-medium">{aggregate.campaignId}</th>
                  <td className="px-2 py-2 tabular-nums">{aggregate.runCount}</td>
                  {COMPARISON_METRICS.map((metric) => {
                    const stats = aggregate.byMetric[metric.key];
                    const delta = deltas[metric.key];
                    return (
                      <td key={metric.key} className="px-2 py-2 tabular-nums">
                        {stats && stats.count > 0
                          ? `${formatMetricValue(metric.key, stats.p50)} / ${formatMetricValue(metric.key, stats.p95)} / ${formatMetricValue(metric.key, stats.p99)}`
                          : "—"}
                        {delta !== null && delta !== undefined && aggregate.campaignId !== baseline?.campaignId && (
                          <span className={delta > 0 ? "ml-1 text-red-600" : "ml-1 text-green-600"}>
                            {formatDeltaPercent(delta)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
