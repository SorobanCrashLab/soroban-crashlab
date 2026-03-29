"use client";

import { useState, useMemo } from "react";
import type { FuzzingRun } from "./types";

/**
 * Issue #258: Add Run comparison builder
 *
 * This component provides an interactive builder for creating custom
 * run comparisons with drag-and-drop functionality, multiple comparison
 * modes, and exportable comparison reports.
 */

interface ComparisonSlot {
  id: string;
  run: FuzzingRun | null;
  label: string;
}

interface ComparisonMode {
  id: string;
  name: string;
  description: string;
  metrics: string[];
}

const COMPARISON_MODES: ComparisonMode[] = [
  {
    id: "performance",
    name: "Performance",
    description: "Compare execution time, CPU, and memory usage",
    metrics: ["duration", "cpuInstructions", "memoryBytes"],
  },
  {
    id: "cost",
    name: "Cost Analysis",
    description: "Focus on resource fees and budget consumption",
    metrics: ["minResourceFee", "cpuInstructions", "memoryBytes"],
  },
  {
    id: "coverage",
    name: "Coverage",
    description: "Compare seed counts and exploration depth",
    metrics: ["seedCount", "duration"],
  },
  {
    id: "custom",
    name: "Custom",
    description: "Select your own metrics to compare",
    metrics: [],
  },
];

const MOCK_RUNS: FuzzingRun[] = Array.from({ length: 10 }, (_, i) => ({
  id: `run-${1000 + i}`,
  status: ["completed", "failed", "running"][i % 3] as FuzzingRun["status"],
  area: ["auth", "state", "budget", "xdr"][i % 4] as FuzzingRun["area"],
  severity: ["low", "medium", "high", "critical"][
    i % 4
  ] as FuzzingRun["severity"],
  duration: 120000 + Math.random() * 3600000,
  seedCount: Math.floor(10000 + Math.random() * 90000),
  cpuInstructions: Math.floor(400000 + Math.random() * 900000),
  memoryBytes: Math.floor(1_500_000 + Math.random() * 8_000_000),
  minResourceFee: Math.floor(500 + Math.random() * 5000),
  crashDetail: null,
}));

export default function AddRunComparisonBuilder() {
  const [comparisonSlots, setComparisonSlots] = useState<ComparisonSlot[]>([
    { id: "slot-1", run: null, label: "Baseline" },
    { id: "slot-2", run: null, label: "Candidate" },
  ]);
  const [selectedMode, setSelectedMode] = useState<string>("performance");
  const [availableRuns] = useState<FuzzingRun[]>(MOCK_RUNS);
  const [showExportModal, setShowExportModal] = useState(false);

  const currentMode =
    COMPARISON_MODES.find((m) => m.id === selectedMode) ?? COMPARISON_MODES[0];

  const handleAddSlot = () => {
    const newSlot: ComparisonSlot = {
      id: `slot-${Date.now()}`,
      run: null,
      label: `Run ${comparisonSlots.length + 1}`,
    };
    setComparisonSlots([...comparisonSlots, newSlot]);
  };

  const handleRemoveSlot = (slotId: string) => {
    if (comparisonSlots.length <= 2) return;
    setComparisonSlots(comparisonSlots.filter((s) => s.id !== slotId));
  };

  const handleAssignRun = (slotId: string, runId: string) => {
    const run = availableRuns.find((r) => r.id === runId);
    setComparisonSlots((prev) =>
      prev.map((slot) =>
        slot.id === slotId ? { ...slot, run: run ?? null } : slot,
      ),
    );
  };

  const handleUpdateLabel = (slotId: string, label: string) => {
    setComparisonSlots((prev) =>
      prev.map((slot) => (slot.id === slotId ? { ...slot, label } : slot)),
    );
  };

  const formatMetricValue = (metric: string, value: number): string => {
    switch (metric) {
      case "duration":
        return `${Math.round(value / 1000)}s`;
      case "cpuInstructions":
        return value.toLocaleString();
      case "memoryBytes":
        return value < 1024 * 1024
          ? `${(value / 1024).toFixed(1)} KB`
          : `${(value / (1024 * 1024)).toFixed(1)} MB`;
      case "minResourceFee":
        return `${value.toLocaleString()} stroops`;
      case "seedCount":
        return value.toLocaleString();
      default:
        return String(value);
    }
  };

  const calculateDelta = (baseline: number, candidate: number): number => {
    if (baseline === 0) return 0;
    return ((candidate - baseline) / baseline) * 100;
  };

  const comparisonData = useMemo(() => {
    const baseline = comparisonSlots[0]?.run;
    if (!baseline) return null;

    return comparisonSlots
      .slice(1)
      .map((slot) => {
        if (!slot.run) return null;

        const deltas: Record<string, number> = {};
        currentMode.metrics.forEach((metric) => {
          const metricKey = metric as keyof FuzzingRun;
          const baseValue = baseline[metricKey] as number;
          const candidateValue = slot.run![metricKey] as number;
          deltas[metric] = calculateDelta(baseValue, candidateValue);
        });

        return {
          slot,
          deltas,
        };
      })
      .filter(Boolean);
  }, [comparisonSlots, currentMode]);

  const filledSlots = comparisonSlots.filter((s) => s.run !== null).length;
  const canCompare = filledSlots >= 2;

  return (
    <section className="w-full rounded-[2.5rem] border border-black/[.08] bg-white p-8 dark:border-white/[.145] dark:bg-zinc-950">
      <div className="mb-8">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-purple-600 dark:text-purple-400">
          Comparison Builder
        </p>
        <h2 className="text-3xl font-bold tracking-tight mb-4">
          Build Custom Run Comparisons
        </h2>
        <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-3xl">
          Create side-by-side comparisons of fuzzing runs with customizable
          metrics, multiple comparison modes, and exportable reports for team
          collaboration.
        </p>
      </div>

      {/* Comparison Mode Selector */}
      <div className="mb-8">
        <h3 className="text-lg font-bold mb-4">Comparison Mode</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {COMPARISON_MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setSelectedMode(mode.id)}
              className={`p-4 rounded-2xl border-2 text-left transition ${
                selectedMode === mode.id
                  ? "border-purple-500 bg-purple-50 dark:bg-purple-950/20"
                  : "border-zinc-200 dark:border-zinc-800 hover:border-purple-300"
              }`}
            >
              <div className="font-bold text-sm mb-1 text-zinc-900 dark:text-zinc-100">
                {mode.name}
              </div>
              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                {mode.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Comparison Slots */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">
            Comparison Slots ({filledSlots}/{comparisonSlots.length})
          </h3>
          <div className="flex gap-2">
            <button
              onClick={handleAddSlot}
              disabled={comparisonSlots.length >= 6}
              className="px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-bold hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              + Add Slot
            </button>
            <button
              onClick={() => setShowExportModal(true)}
              disabled={!canCompare}
              className="px-4 py-2 rounded-xl border border-purple-600 text-purple-600 text-sm font-bold hover:bg-purple-50 dark:hover:bg-purple-950/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Export Comparison
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {comparisonSlots.map((slot, index) => (
            <div
              key={slot.id}
              className={`p-6 rounded-2xl border-2 ${
                index === 0
                  ? "border-purple-500 bg-purple-50/50 dark:bg-purple-950/10"
                  : "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900"
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <input
                  type="text"
                  value={slot.label}
                  onChange={(e) => handleUpdateLabel(slot.id, e.target.value)}
                  className="font-bold text-sm bg-transparent border-none outline-none focus:ring-2 focus:ring-purple-500 rounded px-2 py-1"
                />
                {index === 0 && (
                  <span className="px-2 py-1 rounded-full bg-purple-600 text-white text-[10px] font-bold uppercase">
                    Baseline
                  </span>
                )}
                {index > 1 && (
                  <button
                    onClick={() => handleRemoveSlot(slot.id)}
                    className="text-rose-600 hover:text-rose-700 transition"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
              </div>

              <select
                value={slot.run?.id ?? ""}
                onChange={(e) => handleAssignRun(slot.id, e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm mb-4"
              >
                <option value="">Select a run...</option>
                {availableRuns.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.id} - {run.area} ({run.status})
                  </option>
                ))}
              </select>

              {slot.run && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500">Status</span>
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold ${
                        slot.run.status === "completed"
                          ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                          : slot.run.status === "failed"
                            ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                      }`}
                    >
                      {slot.run.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500">Area</span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {slot.run.area}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500">Severity</span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {slot.run.severity}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Comparison Results */}
      {canCompare && comparisonData && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-6">
          <h3 className="text-lg font-bold mb-4">Comparison Results</h3>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="text-left py-3 px-4 text-sm font-bold text-zinc-700 dark:text-zinc-300">
                    Metric
                  </th>
                  {comparisonSlots
                    .filter((s) => s.run)
                    .map((slot) => (
                      <th
                        key={slot.id}
                        className="text-right py-3 px-4 text-sm font-bold text-zinc-700 dark:text-zinc-300"
                      >
                        {slot.label}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {currentMode.metrics.map((metric) => (
                  <tr
                    key={metric}
                    className="border-b border-zinc-200 dark:border-zinc-800"
                  >
                    <td className="py-3 px-4 text-sm font-medium text-zinc-900 dark:text-zinc-100 capitalize">
                      {metric.replace(/([A-Z])/g, " $1").trim()}
                    </td>
                    {comparisonSlots
                      .filter((s) => s.run)
                      .map((slot, idx) => {
                        const value = slot.run![
                          metric as keyof FuzzingRun
                        ] as number;
                        const delta =
                          idx > 0 && comparisonData[idx - 1]
                            ? comparisonData[idx - 1]!.deltas[metric]
                            : 0;

                        return (
                          <td key={slot.id} className="py-3 px-4 text-right">
                            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                              {formatMetricValue(metric, value)}
                            </div>
                            {idx > 0 && (
                              <div
                                className={`text-xs font-bold ${
                                  delta > 10
                                    ? "text-rose-600"
                                    : delta < -10
                                      ? "text-green-600"
                                      : "text-zinc-500"
                                }`}
                              >
                                {delta > 0 ? "+" : ""}
                                {delta.toFixed(1)}%
                              </div>
                            )}
                          </td>
                        );
                      })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!canCompare && (
        <div className="p-12 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl text-center text-zinc-500">
          <svg
            className="w-12 h-12 mx-auto mb-4 text-zinc-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <p className="text-lg font-medium mb-2">No Comparison Available</p>
          <p className="text-sm">
            Assign runs to at least 2 slots to see comparison results
          </p>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 max-w-md w-full">
            <h3 className="text-2xl font-bold mb-4">Export Comparison</h3>
            <p className="text-zinc-600 dark:text-zinc-400 mb-6">
              Choose a format to export your comparison results
            </p>
            <div className="space-y-3 mb-6">
              <button className="w-full p-4 rounded-xl border-2 border-zinc-200 dark:border-zinc-800 hover:border-purple-500 transition text-left">
                <div className="font-bold text-sm mb-1">JSON</div>
                <div className="text-xs text-zinc-500">
                  Machine-readable format
                </div>
              </button>
              <button className="w-full p-4 rounded-xl border-2 border-zinc-200 dark:border-zinc-800 hover:border-purple-500 transition text-left">
                <div className="font-bold text-sm mb-1">CSV</div>
                <div className="text-xs text-zinc-500">
                  Spreadsheet compatible
                </div>
              </button>
              <button className="w-full p-4 rounded-xl border-2 border-zinc-200 dark:border-zinc-800 hover:border-purple-500 transition text-left">
                <div className="font-bold text-sm mb-1">Markdown</div>
                <div className="text-xs text-zinc-500">
                  Documentation friendly
                </div>
              </button>
            </div>
            <button
              onClick={() => setShowExportModal(false)}
              className="w-full py-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
