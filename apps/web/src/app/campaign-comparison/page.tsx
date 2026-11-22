"use client";

import { useState } from "react";
import { buildMockRuns, buildComparisonMockRuns } from "@/fixtures";
import {
  compareCampaigns,
  calculateDifferencePercentage,
  formatPercentage,
  type CampaignMetrics,
} from "../campaign-comparison-utils";

export default function CampaignComparisonPage() {
  const campaign1Data = {
    id: "campaign-1",
    name: "Campaign A",
    runs: buildMockRuns(),
  };
  const campaign2Data = {
    id: "campaign-2",
    name: "Campaign B",
    runs: buildComparisonMockRuns(),
  };

  const [comparison] = useState(() =>
    compareCampaigns(campaign1Data, campaign2Data),
  );

  const renderMetricRow = (label: string, key: keyof CampaignMetrics) => {
    const value1 = comparison.campaigns[0][key];
    const value2 = comparison.campaigns[1][key];
    const diff =
      typeof value1 === "number" && typeof value2 === "number"
        ? calculateDifferencePercentage(value1, value2)
        : null;

    return (
      <div className="flex items-center justify-between py-3 border-b border-zinc-200 dark:border-zinc-700">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {label}
        </span>
        <div className="flex gap-4 items-center">
          <span className="text-sm text-zinc-900 dark:text-zinc-100 w-20 text-right">
            {value1}
          </span>
          <span className="text-sm text-zinc-900 dark:text-zinc-100 w-20 text-right">
            {value2}
          </span>
          {diff !== null && (
            <span
              className={`text-xs w-16 text-right ${diff > 0 ? "text-green-600 dark:text-green-400" : diff < 0 ? "text-red-600 dark:text-red-400" : "text-zinc-500"}`}
            >
              {formatPercentage(diff)}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="container mx-auto p-4 md:p-6 lg:p-8">
        <h1 className="text-2xl md:text-3xl font-bold mb-6 text-zinc-900 dark:text-zinc-100">
          Campaign Comparison
        </h1>

        <div className="bg-[var(--surface)] border border-zinc-200 dark:border-zinc-700 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Metrics Comparison
            </h2>
            <div className="flex gap-4 text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300 w-20 text-right">
                {comparison.campaigns[0].name}
              </span>
              <span className="font-medium text-zinc-700 dark:text-zinc-300 w-20 text-right">
                {comparison.campaigns[1].name}
              </span>
              <span className="font-medium text-zinc-700 dark:text-zinc-300 w-16 text-right">
                Diff
              </span>
            </div>
          </div>

          {renderMetricRow("Total Runs", "totalRuns")}
          {renderMetricRow("Completed", "completedRuns")}
          {renderMetricRow("Failed", "failedRuns")}
          {renderMetricRow("Cancelled", "cancelledRuns")}
          {renderMetricRow("Running", "runningRuns")}
          {renderMetricRow("Total Seeds", "totalSeeds")}
          {renderMetricRow("Critical Failures", "criticalFailures")}
          {renderMetricRow("High Failures", "highFailures")}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[var(--surface)] border border-zinc-200 dark:border-zinc-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-zinc-100">
              Common Failures ({comparison.commonFailures.length})
            </h3>
            {comparison.commonFailures.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No common failures found
              </p>
            ) : (
              <ul className="space-y-2">
                {comparison.commonFailures.map((sig, idx) => (
                  <li
                    key={idx}
                    className="text-sm text-zinc-700 dark:text-zinc-300 truncate"
                    title={sig}
                  >
                    {sig}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-[var(--surface)] border border-zinc-200 dark:border-zinc-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-zinc-100">
              Unique Failures
            </h3>
            <div className="space-y-4">
              {Object.entries(comparison.uniqueFailures).map(
                ([campaignId, failures]) => {
                  const campaign = comparison.campaigns.find(
                    (c) => c.id === campaignId,
                  );
                  return (
                    <div key={campaignId}>
                      <h4 className="text-sm font-medium mb-2 text-zinc-700 dark:text-zinc-300">
                        {campaign?.name} ({failures.length})
                      </h4>
                      {failures.length === 0 ? (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          None
                        </p>
                      ) : (
                        <ul className="space-y-1">
                          {failures.map((sig, idx) => (
                            <li
                              key={idx}
                              className="text-xs text-zinc-600 dark:text-zinc-400 truncate"
                              title={sig}
                            >
                              {sig}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                },
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
