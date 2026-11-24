"use client";

/** Deterministic flake leaderboard with evidence and a drill-down action (#2314). */

import { confidenceLabel, formatTimestamp } from "./format";
import type { FlakeScore } from "./lib/flake";

export interface FlakeInsightsProps {
  flakes: FlakeScore[];
  onFocusTest?: (name: string) => void;
}

const SEVERITY_CLASSES: Record<FlakeScore["severity"], string> = {
  critical: "bg-rose-50 text-rose-800 ring-rose-600/20 dark:bg-rose-950/40 dark:text-rose-300",
  high: "bg-orange-50 text-orange-900 ring-orange-600/20 dark:bg-orange-950/40 dark:text-orange-300",
  medium: "bg-amber-50 text-amber-900 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300",
  low: "bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-800/60 dark:text-zinc-300",
};

export function FlakeInsights({ flakes, onFocusTest }: FlakeInsightsProps) {
  const counts = flakes.reduce(
    (acc, flake) => {
      acc[flake.severity] += 1;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0 } as Record<FlakeScore["severity"], number>,
  );

  return (
    <section aria-label="Flake insights" className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Flake insights</h2>
        <p className="text-meta">
          Scores come from pass/fail flips, failure rate, rerun recoveries and touched code areas.
          Rerun history is included so one green retry cannot hide instability.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {(["critical", "high", "medium", "low"] as const).map((severity) => (
          <div key={severity} className="card card-padding">
            <p className="text-meta capitalize">{severity}</p>
            <p className="text-xl font-semibold">{counts[severity]}</p>
          </div>
        ))}
      </div>

      {flakes.length === 0 ? (
        <div className="card card-padding">
          <p className="text-meta">No test met the flake threshold in the selected runs.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <caption className="sr-only">Flaky tests ranked by score</caption>
            <thead className="bg-zinc-50 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              <tr>
                <th scope="col" className="px-3 py-2">Test</th>
                <th scope="col" className="px-3 py-2">Score</th>
                <th scope="col" className="px-3 py-2">Severity</th>
                <th scope="col" className="px-3 py-2">Samples</th>
                <th scope="col" className="px-3 py-2">Flips</th>
                <th scope="col" className="px-3 py-2">Recoveries</th>
                <th scope="col" className="px-3 py-2">Areas</th>
                <th scope="col" className="px-3 py-2">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {flakes.map((flake) => (
                <tr key={flake.testId}>
                  <td className="px-3 py-3 align-top">
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">{flake.name}</p>
                    <p className="text-meta">{confidenceLabel(flake.confidence)} confidence</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-700 dark:text-zinc-300">
                      {flake.evidence.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                    {onFocusTest && (
                      <button
                        type="button"
                        className="btn-ghost mt-2 px-2 py-1 text-xs"
                        onClick={() => onFocusTest(flake.name)}
                      >
                        Filter to this test
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="flex items-center gap-2">
                      <span className="w-8 font-semibold tabular-nums">{flake.score}</span>
                      <span
                        className="block h-2 w-20 rounded-full bg-zinc-200 dark:bg-zinc-800"
                        role="img"
                        aria-label={`Flake score ${flake.score} out of 100`}
                      >
                        <span
                          className="block h-2 rounded-full bg-blue-600 dark:bg-blue-400"
                          style={{ width: `${flake.score}%` }}
                        />
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${SEVERITY_CLASSES[flake.severity]}`}
                    >
                      {flake.severity}
                    </span>
                  </td>
                  <td className="px-3 py-3 align-top tabular-nums">
                    {flake.samples} ({flake.passes} pass / {flake.failures} fail)
                  </td>
                  <td className="px-3 py-3 align-top tabular-nums">{flake.flips}</td>
                  <td className="px-3 py-3 align-top tabular-nums">{flake.recoveries}</td>
                  <td className="px-3 py-3 align-top">
                    {flake.codeAreas.length ? flake.codeAreas.join(", ") : "—"}
                  </td>
                  <td className="px-3 py-3 align-top">{formatTimestamp(flake.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default FlakeInsights;
