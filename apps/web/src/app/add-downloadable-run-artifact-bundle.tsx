"use client";

import { useState } from "react";
import type { FuzzingRun } from "./types";
import { collectRunArtifacts } from "./utils/artifact-collection";
import { downloadArtifacts } from "./utils/artifact-download";

type DownloadState = "idle" | "loading" | "error";

type DownloadableRunArtifactBundleProps = {
  runs: FuzzingRun[];
};

export default function AddDownloadableRunArtifactBundle({
  runs,
}: DownloadableRunArtifactBundleProps) {
  const [state, setState] = useState<DownloadState>("idle");

  const handleExport = async () => {
    if (runs.length === 0) return;
    setState("loading");
    try {
      // Build a merged bundle: metadata array + all traces + all fixtures
      const collected = runs.map((run) => collectRunArtifacts(run));
      const bundle = {
        exportedAt: new Date().toISOString(),
        runCount: runs.length,
        runs: collected,
      };

      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `soroban-artifacts-bundle-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setState("idle");
    } catch {
      setState("error");
    }
  };

  const isLoading = state === "loading";
  const isError = state === "error";
  const isDisabled = isLoading || runs.length === 0;

  return (
    <div className="group relative overflow-hidden rounded-4xl border border-emerald-200 bg-emerald-50/50 p-8 shadow-sm transition-all hover:shadow-md dark:border-emerald-900/30 dark:bg-emerald-950/20">
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-500/10 blur-3xl transition-transform group-hover:scale-150" />

      <div className="relative z-10">
        <div className="flex items-center gap-4 mb-4">
          <div className="h-12 w-12 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
              Download Run Artifact Bundle
            </h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Offline analysis bundle with metadata traces and fixture exports.
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex flex-col">
            <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Runs in bundle
            </span>
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {runs.length}
            </span>
          </div>

          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={handleExport}
              disabled={isDisabled}
              aria-busy={isLoading}
              aria-label={
                isLoading
                  ? "Preparing artifact bundle…"
                  : `Download artifact bundle for ${runs.length} run${runs.length !== 1 ? "s" : ""}`
              }
              className={`relative flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
                isDisabled
                  ? "bg-zinc-200 text-zinc-500 cursor-not-allowed dark:bg-zinc-800 dark:text-zinc-500"
                  : isError
                    ? "bg-red-600 text-white hover:bg-red-700 hover:shadow-xl hover:shadow-red-500/30"
                    : "bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-500/30"
              }`}
            >
              {isLoading ? (
                <>
                  <svg
                    className="w-5 h-5 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Preparing…
                </>
              ) : isError ? (
                <>
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                    />
                  </svg>
                  Retry Download
                </>
              ) : (
                <>
                  <span>Download Bundle</span>
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </>
              )}
            </button>
            {isError && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                Export failed. Please try again.
              </p>
            )}
            {runs.length === 0 && (
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                No runs selected.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
