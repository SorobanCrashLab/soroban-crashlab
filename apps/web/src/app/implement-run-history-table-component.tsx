"use client";

import React, { useState, useMemo } from "react";
import { FuzzingRun, RunStatus, RunSeverity } from "./types";

interface RunHistoryTableProps {
  /** Array of fuzzing runs to display */
  runs: FuzzingRun[];
  /** Called when a row is selected to open crash details */
  onSelectRun: (runId: string) => void;
  /** Called when the report button is clicked for a run */
  onViewReport: (run: FuzzingRun) => void;
  /** Called when a replay is initiated for a run */
  onReplayRun?: (newRunData: { id: string; status: "running" }) => void;
  /** List of visible columns */
  visibleColumns?: string[];
  /** Set of selected run IDs for bulk actions */
  selectedRunIds?: Set<string>;
  /** Called to toggle selection of a run */
  onToggleRunSelection?: (runId: string) => void;
  /** Called to toggle selection of all runs */
  onToggleAllRunsSelection?: (runIds: string[]) => void;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor(ms / (1000 * 60 * 60));

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(" ");
};

const StatusBadge = ({ status }: { status: RunStatus }) => {
  const styles = {
    running:
      "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
    completed:
      "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
    failed:
      "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
    cancelled:
      "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-widest ${styles[status]}`}
    >
      <span
        className={`w-1 h-1 rounded-full mr-1.5 ${
          status === "running"
            ? "animate-pulse bg-blue-500"
            : status === "completed"
              ? "bg-green-500"
              : status === "failed"
                ? "bg-red-500"
                : "bg-zinc-400"
        }`}
      />
      {status}
    </span>
  );
};

const SeverityBadge = ({ severity }: { severity: RunSeverity }) => {
  const styles = {
    low: "text-zinc-500 bg-zinc-50 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800",
    medium:
      "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800",
    high: "text-orange-600 bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800",
    critical:
      "text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 font-bold",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded text-[10px] border uppercase tracking-tighter ${styles[severity]}`}
    >
      {severity}
    </span>
  );
};

/**
 * Enhanced Run History Table component for improved UX.
 * Features include:
 * - Sortable columns
 * - Severity indicators
 * - Micro-interactions and hover effects
 * - Responsive layout
 */
export default function EnhancedRunHistoryTable({
  runs,
  onSelectRun,
  onViewReport,
  visibleColumns = [
    "id",
    "status",
    "severity",
    "duration",
    "seedCount",
    "cpu",
    "actions",
  ],
  selectedRunIds = new Set(),
  onToggleRunSelection,
  onToggleAllRunsSelection,
}: RunHistoryTableProps) {
  const [sortField, setSortField] = useState<keyof FuzzingRun>("id");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const sortedRuns = useMemo(() => {
    return [...runs].sort((a: FuzzingRun, b: FuzzingRun) => {
      const valA = a[sortField] ?? "";
      const valB = b[sortField] ?? "";
      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [runs, sortField, sortOrder]);

  const toggleSort = (field: keyof FuzzingRun) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl bg-zinc-50/30 dark:bg-zinc-900/10">
        <div className="w-16 h-16 bg-zinc-50 dark:bg-zinc-900 rounded-2xl flex items-center justify-center mb-6 text-zinc-300 border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <svg
            className="w-8 h-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          Silence in the Lab
        </h3>
        <p className="text-zinc-500 dark:text-zinc-400 mt-2 text-center max-w-xs text-sm">
          No fuzzing runs have been recorded yet. Start a campaign to see
          execution traces.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-2xl transition-all hover:shadow-blue-500/5">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-zinc-50/50 dark:bg-zinc-900/50 border-b border-zinc-100 dark:border-zinc-900">
              {onToggleRunSelection && (
                <th className="px-6 py-5 text-[10px] font-bold text-zinc-400 w-12">
                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={runs.length > 0 && selectedRunIds.size === runs.length}
                      ref={(input) => {
                         if (input) {
                           input.indeterminate = selectedRunIds.size > 0 && selectedRunIds.size < runs.length;
                         }
                      }}
                      onChange={() => {
                        if (onToggleAllRunsSelection) {
                          onToggleAllRunsSelection(runs.map(r => r.id));
                        }
                      }}
                      className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                    />
                  </div>
                </th>
              )}
              {visibleColumns.includes("id") && (
                <th
                  className="px-6 py-5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                  onClick={() => toggleSort("id")}
                >
                  Run Identifier{" "}
                  {sortField === "id" && (sortOrder === "asc" ? "↑" : "↓")}
                </th>
              )}
              {visibleColumns.includes("status") && (
                <th className="px-6 py-5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  Status
                </th>
              )}
              {visibleColumns.includes("severity") && (
                <th className="px-6 py-5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-center">
                  Severity
                </th>
              )}
              {visibleColumns.includes("duration") && (
                <th
                  className="px-6 py-5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                  onClick={() => toggleSort("duration")}
                >
                  Timeline{" "}
                  {sortField === "duration" &&
                    (sortOrder === "asc" ? "↑" : "↓")}
                </th>
              )}
              {visibleColumns.includes("seedCount") && (
                <th
                  className="px-6 py-5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                  onClick={() => toggleSort("seedCount")}
                >
                  Vectors{" "}
                  {sortField === "seedCount" &&
                    (sortOrder === "asc" ? "↑" : "↓")}
                </th>
              )}
              {visibleColumns.includes("cpu") && (
                <th className="px-6 py-5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">
                  Cycles
                </th>
              )}
              {visibleColumns.includes("actions") && (
                <th className="px-6 py-5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right pr-8">
                  Operations
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50 dark:divide-zinc-900/50">
            {sortedRuns.map((run) => (
              <tr
                key={run.id}
                className={`group transition-all cursor-pointer ${
                  selectedRunIds.has(run.id) 
                    ? "bg-blue-50/80 dark:bg-blue-900/20" 
                    : "hover:bg-blue-50/30 dark:hover:bg-blue-900/10"
                }`}
                onClick={(e) => {
                  if ((e.target as HTMLElement).tagName.toLowerCase() !== 'input') {
                     onSelectRun(run.id);
                  }
                }}
              >
                {onToggleRunSelection && (
                  <td className="px-6 py-5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={selectedRunIds.has(run.id)}
                        onChange={() => onToggleRunSelection(run.id)}
                        className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                      />
                    </div>
                  </td>
                )}
                {visibleColumns.includes("id") && (
                  <td className="px-6 py-5">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 font-mono group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          #{run.id.split("-").pop()}
                        </span>
                        {run.annotations && run.annotations.length > 0 && (
                          <svg
                            className="w-3.5 h-3.5 text-indigo-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <title>{`${run.annotations.length} annotations`}</title>
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                            />
                          </svg>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-tight mt-0.5">
                        {run.area} focus
                      </span>
                    </div>
                  </td>
                )}
                {visibleColumns.includes("status") && (
                  <td className="px-6 py-5">
                    <StatusBadge status={run.status} />
                  </td>
                )}
                {visibleColumns.includes("severity") && (
                  <td className="px-6 py-5">
                    <div className="flex justify-center">
                      <SeverityBadge severity={run.severity} />
                    </div>
                  </td>
                )}
                {visibleColumns.includes("duration") && (
                  <td className="px-6 py-5 text-right">
                    <div className="flex flex-col items-end">
                      <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200 tabular-nums">
                        {formatDuration(run.duration)}
                      </span>
                      <span className="text-[9px] text-zinc-400 uppercase font-bold tracking-tight">
                        Wall Time
                      </span>
                    </div>
                  </td>
                )}
                {visibleColumns.includes("seedCount") && (
                  <td className="px-6 py-5 text-right">
                    <span className="text-sm font-black text-zinc-900 dark:text-zinc-100 tabular-nums">
                      {run.seedCount.toLocaleString()}
                    </span>
                  </td>
                )}
                {visibleColumns.includes("cpu") && (
                  <td className="px-6 py-5 text-right">
                    <span className="text-xs font-medium text-zinc-500 tabular-nums">
                      {(run.cpuInstructions / 1_000_000).toFixed(1)}M
                    </span>
                  </td>
                )}
                {visibleColumns.includes("actions") && (
                  <td className="px-6 py-5 text-right pr-8">
                    <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all transform translate-x-1 group-hover:translate-x-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewReport(run);
                        }}
                        className="p-2 bg-white dark:bg-zinc-900 rounded-xl text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all border border-zinc-200 dark:border-zinc-800 shadow-sm"
                        title="View Full Report"
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
                            d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectRun(run.id);
                        }}
                        className="px-5 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-[11px] font-black uppercase tracking-widest shadow-xl shadow-black/10 hover:shadow-blue-500/20 active:scale-95 transition-all"
                      >
                        Inspect
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-6 py-4 bg-zinc-50/50 dark:bg-zinc-900/30 border-t border-zinc-100 dark:border-zinc-900 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-[10px] font-bold text-zinc-500 uppercase">
              Healthy Trace
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] font-bold text-zinc-500 uppercase">
              Crash Detected
            </span>
          </div>
        </div>
        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
          {runs.length} Sessions Synchronized
        </span>
      </div>
    </div>
  );
}
