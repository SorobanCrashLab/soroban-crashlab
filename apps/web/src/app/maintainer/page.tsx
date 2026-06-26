/**
 * Maintainer Dashboard Page
 *
 * Isolated route for maintainer-specific widgets and tools.
 * Only accessible when maintainer mode is enabled.
 *
 * Issue: #647 - Isolate maintainer widgets route
 */

"use client";

import { useMaintainerMode } from "../useMaintainerMode";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FuzzingRun } from "../types";
import { fetchRuns as fetchRunsFromApi } from "../../lib/api-client";
import CrossRunBoardWidgets from "../implement-cross-run-board-widgets-component";
import CrossRunBoardCustomWidgets from "../create-cross-run-board-custom-widgets-63";
import AlertPresets from "../AlertPresets";
import WidgetLayoutEditor from "../implement-widget-layout-editor-component";
import { ResourceFeeInsightPanel } from "../implement-resource-fee-insight-panel-component";

export default function MaintainerPage() {
  const { isMaintainer, mounted } = useMaintainerMode();
  const router = useRouter();
  const [runs, setRuns] = useState<FuzzingRun[]>([]);
  const [dataState, setDataState] = useState<"loading" | "error" | "success">(
    "loading",
  );
  const [fetchAttempt, setFetchAttempt] = useState(0);

  // Redirect if not maintainer
  useEffect(() => {
    if (mounted && !isMaintainer) {
      router.push("/");
    }
  }, [isMaintainer, mounted, router]);

  // Fetch runs data
  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    const loadRuns = async () => {
      setDataState("loading");
      try {
        const data = await fetchRunsFromApi(ctrl.signal);
        if (!cancelled) {
          setRuns(data.runs || []);
          setDataState("success");
        }
      } catch {
        if (!cancelled) setDataState("error");
      }
    };

    const timer = window.setTimeout(() => {
      void loadRuns();
    }, 0);

    return () => {
      cancelled = true;
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [fetchAttempt]);

  // Show loading while checking auth
  if (!mounted) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-zinc-600 dark:text-zinc-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect in progress
  if (!isMaintainer) {
    return null;
  }

  return (
    <div className="min-h-screen w-full">
      <div className="flex flex-col items-center justify-center py-20 px-8 max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="w-full mb-12">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight mb-2">
                Maintainer Dashboard
              </h1>
              <p className="text-zinc-600 dark:text-zinc-400">
                Advanced tools and insights for project maintainers
              </p>
            </div>
            <button
              onClick={() => router.push("/")}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back to Dashboard
            </button>
          </div>
        </div>

        {/* Loading State */}
        {dataState === "loading" && (
          <div role="status" aria-live="polite" className="w-full space-y-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-64 bg-zinc-200 dark:bg-zinc-800 rounded-2xl animate-pulse"
              />
            ))}
          </div>
        )}

        {/* Error State */}
        {dataState === "error" && (
          <div role="alert" className="w-full border border-red-200 dark:border-red-900/50 rounded-2xl p-8 bg-red-50/60 dark:bg-red-950/20 text-center">
            <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center mx-auto mb-4">
              <svg
                className="h-6 w-6 text-red-600 dark:text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                />
              </svg>
            </div>
            <p className="font-semibold text-red-900 dark:text-red-100 mb-2">
              Failed to load maintainer data
            </p>
            <p className="text-sm text-red-700 dark:text-red-300 mb-4">
              Check your connection and try again.
            </p>
            <button
              onClick={() => setFetchAttempt((n) => n + 1)}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-red-700"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582M20 20v-5h-.581M5.635 15A9 9 0 1118.365 9"
                />
              </svg>
              Retry
            </button>
          </div>
        )}

        {/* Success State - Maintainer Widgets */}
        {dataState === "success" && (
          <div className="w-full space-y-12">
            {/* Cross-Run Board Widgets */}
            <section>
              <h2 className="text-2xl font-bold mb-6">Cross-Run Analytics</h2>
              <CrossRunBoardWidgets
                runs={runs}
                dataState={dataState}
                onRetry={() => setFetchAttempt((n) => n + 1)}
                errorMessage="Failed to load cross-run statistics."
              />
            </section>

            {/* Custom Widgets */}
            <section>
              <h2 className="text-2xl font-bold mb-6">Custom Widgets</h2>
              <CrossRunBoardCustomWidgets runs={runs} />
            </section>

            {/* Alert Presets */}
            <section>
              <h2 className="text-2xl font-bold mb-6">Alert Configuration</h2>
              <AlertPresets />
            </section>

            {/* Widget Layout Editor */}
            <section>
              <h2 className="text-2xl font-bold mb-6">Layout Editor</h2>
              <WidgetLayoutEditor />
            </section>

            {/* Resource Fee Insights */}
            <section>
              <h2 className="text-2xl font-bold mb-6">Resource Fee Analysis</h2>
              <ResourceFeeInsightPanel runs={runs} />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
