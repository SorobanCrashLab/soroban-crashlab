"use client";

import { useState, useCallback } from "react";
import type { FuzzingRun } from "./types";
import { simulateSeedReplay } from "./replay";

/**
 * Issue #275: Add Run replay UI
 *
 * This component provides a comprehensive UI for replaying fuzzing runs,
 * including seed selection, replay configuration, real-time progress tracking,
 * and result visualization.
 */

interface ReplayConfig {
  seedSelection: "all" | "failed" | "custom";
  customSeeds: string;
  debugMode: boolean;
  captureTraces: boolean;
  timeoutMs: number;
}

interface ReplayProgress {
  status: "idle" | "running" | "completed" | "failed";
  current: number;
  total: number;
  startTime?: number;
  endTime?: number;
}

interface ReplayResult {
  runId: string;
  seedsReplayed: number;
  seedsFailed: number;
  duration: number;
  traces: string[];
}

const DEFAULT_CONFIG: ReplayConfig = {
  seedSelection: "failed",
  customSeeds: "",
  debugMode: false,
  captureTraces: true,
  timeoutMs: 30000,
};

const MOCK_RUNS: FuzzingRun[] = Array.from({ length: 5 }, (_, i) => ({
  id: `run-${1000 + i}`,
  status: "failed",
  area: ["auth", "state", "budget", "xdr"][i % 4] as FuzzingRun["area"],
  severity: ["high", "critical"][i % 2] as FuzzingRun["severity"],
  duration: 120000 + Math.random() * 3600000,
  seedCount: Math.floor(100 + Math.random() * 900),
  cpuInstructions: Math.floor(400000 + Math.random() * 900000),
  memoryBytes: Math.floor(1_500_000 + Math.random() * 8_000_000),
  minResourceFee: Math.floor(500 + Math.random() * 5000),
  crashDetail: {
    failureCategory: "Panic",
    signature: `sig:${1000 + i}:contract::transfer:assert_balance_nonnegative`,
    payload: JSON.stringify({ contract: "token", method: "transfer" }),
    replayAction: `cargo run --bin crash-replay -- --run-id run-${1000 + i}`,
  },
}));

export default function AddRunReplayUi() {
  const [selectedRun, setSelectedRun] = useState<FuzzingRun | null>(null);
  const [config, setConfig] = useState<ReplayConfig>(DEFAULT_CONFIG);
  const [progress, setProgress] = useState<ReplayProgress>({
    status: "idle",
    current: 0,
    total: 0,
  });
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [replayHistory, setReplayHistory] = useState<ReplayResult[]>([]);

  const handleSelectRun = (runId: string) => {
    const run = MOCK_RUNS.find((r) => r.id === runId);
    setSelectedRun(run ?? null);
    setResult(null);
    setProgress({ status: "idle", current: 0, total: 0 });
  };

  const handleStartReplay = useCallback(async () => {
    if (!selectedRun) return;

    const totalSeeds =
      config.seedSelection === "all"
        ? selectedRun.seedCount
        : config.seedSelection === "failed"
          ? Math.floor(selectedRun.seedCount * 0.1)
          : config.customSeeds.split(",").filter((s) => s.trim()).length;

    setProgress({
      status: "running",
      current: 0,
      total: totalSeeds,
      startTime: Date.now(),
    });
    setResult(null);

    try {
      // Simulate replay with progress updates
      for (let i = 0; i <= totalSeeds; i++) {
        await new Promise((r) => setTimeout(r, 100));
        setProgress((prev) => ({
          ...prev,
          current: i,
        }));
      }

      const { newRunId } = await simulateSeedReplay(selectedRun.id);
      const endTime = Date.now();
      const duration = endTime - (progress.startTime ?? endTime);

      const replayResult: ReplayResult = {
        runId: newRunId,
        seedsReplayed: totalSeeds,
        seedsFailed: Math.floor(totalSeeds * 0.05),
        duration,
        traces: [
          "Trace 1: contract::transfer -> assert_balance_nonnegative",
          "Trace 2: contract::mint -> overflow_check",
          "Trace 3: contract::burn -> underflow_check",
        ],
      };

      setResult(replayResult);
      setReplayHistory((prev) => [replayResult, ...prev].slice(0, 5));
      setProgress((prev) => ({
        ...prev,
        status: "completed",
        endTime,
      }));
    } catch {
      setProgress((prev) => ({
        ...prev,
        status: "failed",
        endTime: Date.now(),
      }));
    }
  }, [selectedRun, config, progress.startTime]);

  const handleStopReplay = () => {
    setProgress((prev) => ({
      ...prev,
      status: "failed",
      endTime: Date.now(),
    }));
  };

  const progressPercentage =
    progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  const isReplaying = progress.status === "running";
  const canStartReplay = selectedRun && !isReplaying;

  return (
    <section className="w-full rounded-[2.5rem] border border-black/[.08] bg-white p-8 dark:border-white/[.145] dark:bg-zinc-950">
      <div className="mb-8">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-indigo-600 dark:text-indigo-400">
          Replay System
        </p>
        <h2 className="text-3xl font-bold tracking-tight mb-4">
          Run Replay UI
        </h2>
        <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-3xl">
          Replay failed fuzzing runs with custom configurations, track progress
          in real-time, and analyze results with detailed execution traces.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Left Column - Configuration */}
        <div className="xl:col-span-1">
          <div className="bg-zinc-50 dark:bg-zinc-900 p-6 rounded-[2rem] border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-lg font-bold mb-4">Replay Configuration</h3>

            {/* Run Selection */}
            <div className="mb-6">
              <label className="block text-sm font-bold mb-2 text-zinc-700 dark:text-zinc-300">
                Select Run to Replay
              </label>
              <select
                value={selectedRun?.id ?? ""}
                onChange={(e) => handleSelectRun(e.target.value)}
                disabled={isReplaying}
                className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 focus:ring-2 focus:ring-indigo-500 outline-none transition disabled:opacity-50"
              >
                <option value="">Choose a run...</option>
                {MOCK_RUNS.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.id} - {run.area} ({run.seedCount} seeds)
                  </option>
                ))}
              </select>
            </div>

            {selectedRun && (
              <>
                {/* Seed Selection */}
                <div className="mb-6">
                  <label className="block text-sm font-bold mb-2 text-zinc-700 dark:text-zinc-300">
                    Seed Selection
                  </label>
                  <div className="space-y-2">
                    {(["all", "failed", "custom"] as const).map((option) => (
                      <label
                        key={option}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="radio"
                          name="seedSelection"
                          value={option}
                          checked={config.seedSelection === option}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              seedSelection: e.target.value as typeof option,
                            }))
                          }
                          disabled={isReplaying}
                          className="w-4 h-4"
                        />
                        <span className="text-sm text-zinc-700 dark:text-zinc-300 capitalize">
                          {option === "all"
                            ? `All seeds (${selectedRun.seedCount})`
                            : option === "failed"
                              ? `Failed seeds only (~${Math.floor(selectedRun.seedCount * 0.1)})`
                              : "Custom seed list"}
                        </span>
                      </label>
                    ))}
                  </div>
                  {config.seedSelection === "custom" && (
                    <input
                      type="text"
                      placeholder="e.g., 1,5,10,42"
                      value={config.customSeeds}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          customSeeds: e.target.value,
                        }))
                      }
                      disabled={isReplaying}
                      className="w-full mt-2 px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm disabled:opacity-50"
                    />
                  )}
                </div>

                {/* Options */}
                <div className="mb-6 space-y-3">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Debug Mode
                    </span>
                    <button
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          debugMode: !prev.debugMode,
                        }))
                      }
                      disabled={isReplaying}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                        config.debugMode
                          ? "bg-indigo-600"
                          : "bg-zinc-300 dark:bg-zinc-700"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          config.debugMode ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </label>

                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Capture Traces
                    </span>
                    <button
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          captureTraces: !prev.captureTraces,
                        }))
                      }
                      disabled={isReplaying}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                        config.captureTraces
                          ? "bg-indigo-600"
                          : "bg-zinc-300 dark:bg-zinc-700"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          config.captureTraces
                            ? "translate-x-6"
                            : "translate-x-1"
                        }`}
                      />
                    </button>
                  </label>
                </div>

                {/* Timeout */}
                <div className="mb-6">
                  <label className="block text-sm font-bold mb-2 text-zinc-700 dark:text-zinc-300">
                    Timeout (ms): {config.timeoutMs}
                  </label>
                  <input
                    type="range"
                    min="5000"
                    max="60000"
                    step="5000"
                    value={config.timeoutMs}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        timeoutMs: parseInt(e.target.value),
                      }))
                    }
                    disabled={isReplaying}
                    className="w-full disabled:opacity-50"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  {!isReplaying ? (
                    <button
                      onClick={handleStartReplay}
                      disabled={!canStartReplay}
                      className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Start Replay
                    </button>
                  ) : (
                    <button
                      onClick={handleStopReplay}
                      className="flex-1 py-3 rounded-xl bg-rose-600 text-white font-bold hover:bg-rose-700 transition"
                    >
                      Stop Replay
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Column - Progress & Results */}
        <div className="xl:col-span-2 space-y-6">
          {/* Progress */}
          {(isReplaying || progress.status !== "idle") && (
            <div className="p-6 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">Replay Progress</h3>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                    progress.status === "running"
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                      : progress.status === "completed"
                        ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                        : progress.status === "failed"
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                          : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {progress.status}
                </span>
              </div>

              <div className="mb-4">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-zinc-600 dark:text-zinc-400">
                    {progress.current} / {progress.total} seeds
                  </span>
                  <span className="font-bold text-zinc-900 dark:text-zinc-100">
                    {progressPercentage.toFixed(1)}%
                  </span>
                </div>
                <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
              </div>

              {progress.startTime && (
                <div className="text-xs text-zinc-500">
                  Elapsed:{" "}
                  {Math.floor((Date.now() - progress.startTime) / 1000)}s
                </div>
              )}
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="p-6 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
              <h3 className="text-lg font-bold mb-4">Replay Results</h3>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                    {result.seedsReplayed}
                  </div>
                  <div className="text-xs text-zinc-500">Seeds Replayed</div>
                </div>
                <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50">
                  <div className="text-2xl font-bold text-rose-700 dark:text-rose-300">
                    {result.seedsFailed}
                  </div>
                  <div className="text-xs text-rose-600 dark:text-rose-400">
                    Failed
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                    {(result.duration / 1000).toFixed(1)}s
                  </div>
                  <div className="text-xs text-zinc-500">Duration</div>
                </div>
                <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                    {result.traces.length}
                  </div>
                  <div className="text-xs text-zinc-500">Traces</div>
                </div>
              </div>

              {config.captureTraces && result.traces.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold mb-2 text-zinc-700 dark:text-zinc-300">
                    Execution Traces
                  </h4>
                  <div className="space-y-2">
                    {result.traces.map((trace, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 font-mono text-xs text-zinc-700 dark:text-zinc-300"
                      >
                        {trace}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Replay History */}
          {replayHistory.length > 0 && (
            <div className="p-6 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
              <h3 className="text-lg font-bold mb-4">Recent Replays</h3>
              <div className="space-y-3">
                {replayHistory.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-4 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800"
                  >
                    <div>
                      <div className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        {item.runId}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {item.seedsReplayed} seeds ·{" "}
                        {(item.duration / 1000).toFixed(1)}s
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-rose-600 dark:text-rose-400">
                        {item.seedsFailed} failed
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!selectedRun && (
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
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-lg font-medium mb-2">No Run Selected</p>
              <p className="text-sm">
                Select a run from the configuration panel to start replaying
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
