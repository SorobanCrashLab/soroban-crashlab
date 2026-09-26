"use client";

import { useState, useEffect } from "react";

import { createGrafanaAdapter } from "@/lib/integrations/grafana-adapter";
import type {
  GrafanaConfig,
  GrafanaAnnotation,
} from "./integrate-grafana-dashboard-annotation-api-utils";
import {
  validateGrafanaConfig,
  summariseAnnotations,
  formatAnnotationTimestamp,
  annotationStatusLabel,
} from "./integrate-grafana-dashboard-annotation-api-utils";

/**
 * Issue #1095 – [integration] Add Grafana dashboard annotation API integration
 *
 * Dashboard component for configuring and monitoring the Grafana annotation
 * integration. When a fuzzing run starts, fails, or completes, an annotation
 * is posted to the Grafana Annotations API so the event shows up as a marker
 * on your Grafana dashboards.
 */

const DEFAULT_CONFIG: GrafanaConfig = {
  baseUrl: "",
  apiToken: "",
  dashboardUid: "",
  defaultTags: ["soroban-crashlab"],
  enabled: false,
};

const STATUS_BADGE: Record<string, string> = {
  sent: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300",
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

export default function IntegrateGrafanaDashboardAnnotationApi() {
  const [config, setConfig] = useState<GrafanaConfig>(DEFAULT_CONFIG);
  const [recentAnnotations, setRecentAnnotations] = useState<GrafanaAnnotation[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isCreatingTest, setIsCreatingTest] = useState(false);
  const [createResult, setCreateResult] = useState<"success" | "error" | null>(null);

  const adapter = createGrafanaAdapter();

  // Load config on mount.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const savedConfig = await adapter.loadConfig();
        if (!cancelled && savedConfig) {
          setConfig(savedConfig);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError("Failed to load Grafana configuration.");
          console.error(err);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load recent annotations on mount.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const annotations = await adapter.fetchRecentAnnotations();
        if (!cancelled) setRecentAnnotations(annotations);
      } catch (err) {
        console.error("Failed to load recent Grafana annotations:", err);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = summariseAnnotations(recentAnnotations);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveSuccess(false);

    const validation = validateGrafanaConfig(config);
    if (!validation.isValid) {
      setValidationErrors(validation.errors);
      return;
    }
    setValidationErrors([]);

    setIsSaving(true);
    try {
      await adapter.saveConfig(config);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save Grafana config:", err);
      setLoadError("Failed to save configuration. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTestConnection() {
    setIsTesting(true);
    setTestResult(null);
    setTestError(null);

    try {
      const result = await adapter.testConnection(config.baseUrl, config.apiToken);
      setTestResult(result.success ? "success" : "error");
      if (!result.success) setTestError(result.error ?? "Connection failed");
    } finally {
      setIsTesting(false);
    }
  }

  async function handleCreateTestAnnotation() {
    setIsCreatingTest(true);
    setCreateResult(null);

    try {
      const result = await adapter.createAnnotation({
        runId: `test-run-${Date.now()}`,
        text: "[Test] SorobanCrashLab Grafana annotation – please ignore",
        tags: [...config.defaultTags, "manual-test"],
        timeMs: Date.now(),
      });
      setCreateResult(result.success ? "success" : "error");
    } finally {
      setIsCreatingTest(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600" />
          <p className="text-zinc-500 dark:text-zinc-400">Loading Grafana configuration…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">

      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-3 flex items-center gap-3">
            {/* Grafana-inspired dashboard icon */}
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-900/30">
              <svg className="h-7 w-7 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 17v-2a2 2 0 012-2h2a2 2 0 012 2v2m-9 4h14a2 2 0 002-2V7.414a2 2 0 00-.586-1.414l-3.414-3.414A2 2 0 0014.586 2H5a2 2 0 00-2 2v15a2 2 0 002 2z" />
              </svg>
            </span>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
                Grafana Annotations
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Issue #1095 · area:integrations · priority:p2
              </p>
            </div>
          </div>
          <p className="max-w-2xl leading-relaxed text-zinc-600 dark:text-zinc-400">
            Automatically mark fuzzing run lifecycle events on your Grafana dashboards.
            Annotations are posted via the Grafana Annotations API so starts, failures,
            and completions show up as timeline markers alongside your metrics.
          </p>
        </div>

        {/* Enabled toggle */}
        <div className="flex flex-shrink-0 flex-col items-start gap-2 sm:items-end sm:ml-6">
          <label className="flex cursor-pointer items-center gap-3">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {config.enabled ? "Enabled" : "Disabled"}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={config.enabled}
              onClick={() => setConfig((c) => ({ ...c, enabled: !c.enabled }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-500 ${
                config.enabled ? "bg-green-500" : "bg-zinc-300 dark:bg-zinc-700"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  config.enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </label>
        </div>
      </div>

      {/* Error banner */}
      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400">
          {loadError}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total Annotations", value: summary.total, colour: "purple" },
          { label: "Sent", value: summary.sent, colour: "green" },
          { label: "Pending", value: summary.pending, colour: "yellow" },
          { label: "Failed", value: summary.failed, colour: "red" },
        ].map(({ label, value, colour }) => (
          <div
            key={label}
            className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50"
          >
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              {label}
            </p>
            <p className={`text-3xl font-bold text-${colour}-600 dark:text-${colour}-400`}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Configuration form */}
      <section className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="border-b border-zinc-200 px-8 py-5 dark:border-zinc-800">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Configuration</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Enter your Grafana instance URL and API token to enable annotation posting.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-6 px-8 py-6">
          {/* Validation errors */}
          {validationErrors.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/20">
              <p className="mb-2 text-sm font-semibold text-red-700 dark:text-red-400">
                Please fix the following errors:
              </p>
              <ul className="list-inside list-disc space-y-1 text-sm text-red-600 dark:text-red-400">
                {validationErrors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Base URL */}
          <div>
            <label
              htmlFor="grafana-base-url"
              className="mb-1.5 block text-sm font-semibold text-zinc-700 dark:text-zinc-300"
            >
              Grafana Base URL
            </label>
            <input
              id="grafana-base-url"
              type="text"
              value={config.baseUrl}
              onChange={(e) => setConfig((c) => ({ ...c, baseUrl: e.target.value }))}
              placeholder="https://grafana.example.com"
              className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-600"
            />
          </div>

          {/* API token */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              API Token
            </label>
            <div className="relative flex items-center gap-2">
              <input
                id="grafana-api-token"
                type={showTokenInput ? "text" : "password"}
                value={config.apiToken}
                onChange={(e) => setConfig((c) => ({ ...c, apiToken: e.target.value }))}
                placeholder="Enter your Grafana service account token…"
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-600"
                aria-label="Grafana API token"
              />
              <button
                type="button"
                onClick={() => setShowTokenInput((v) => !v)}
                className="flex-shrink-0 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                aria-label={showTokenInput ? "Hide API token" : "Show API token"}
              >
                {showTokenInput ? "Hide" : "Show"}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              Create a service account token in Grafana → Administration → Service accounts.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Dashboard UID */}
            <div>
              <label
                htmlFor="grafana-dashboard-uid"
                className="mb-1.5 block text-sm font-semibold text-zinc-700 dark:text-zinc-300"
              >
                Dashboard UID (optional)
              </label>
              <input
                id="grafana-dashboard-uid"
                type="text"
                value={config.dashboardUid ?? ""}
                onChange={(e) => setConfig((c) => ({ ...c, dashboardUid: e.target.value }))}
                placeholder="crashlab-overview"
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-600"
              />
              <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                Scopes annotations to a single dashboard. Leave blank for org-wide annotations.
              </p>
            </div>

            {/* Default tags */}
            <div>
              <label
                htmlFor="grafana-default-tags"
                className="mb-1.5 block text-sm font-semibold text-zinc-700 dark:text-zinc-300"
              >
                Default Tags
              </label>
              <input
                id="grafana-default-tags"
                type="text"
                value={config.defaultTags.join(", ")}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    defaultTags: e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  }))
                }
                placeholder="soroban-crashlab, nightly"
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-600"
              />
              <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                Comma-separated tags applied to every annotation.
              </p>
            </div>
          </div>

          {/* Save button */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              id="grafana-save-config"
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-500/20 transition-all hover:bg-purple-700 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Saving…
                </>
              ) : (
                "Save Configuration"
              )}
            </button>

            {saveSuccess && (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Saved
              </span>
            )}
          </div>
        </form>
      </section>

      {/* Connection test */}
      <section className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="border-b border-zinc-200 px-8 py-5 dark:border-zinc-800">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Connection Test</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Verify that your API token is valid and the Grafana instance is reachable.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 px-8 py-6">
          <button
            id="grafana-test-connection"
            type="button"
            disabled={isTesting || !config.baseUrl || !config.apiToken}
            onClick={handleTestConnection}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition-all hover:border-purple-300 hover:text-purple-600 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-purple-700 dark:hover:text-purple-400"
          >
            {isTesting ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-purple-600" />
                Testing…
              </>
            ) : (
              "Test Connection"
            )}
          </button>

          <button
            id="grafana-create-test-annotation"
            type="button"
            disabled={isCreatingTest || !config.baseUrl || !config.apiToken}
            onClick={handleCreateTestAnnotation}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition-all hover:border-orange-300 hover:text-orange-600 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-orange-700 dark:hover:text-orange-400"
          >
            {isCreatingTest ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-orange-600" />
                Creating…
              </>
            ) : (
              "Create Test Annotation"
            )}
          </button>

          {testResult === "success" && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Connection successful
            </span>
          )}
          {testResult === "error" && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 dark:text-red-400">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              {testError ?? "Connection failed"}
            </span>
          )}
          {createResult === "success" && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Test annotation sent — check Grafana
            </span>
          )}
          {createResult === "error" && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 dark:text-red-400">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Failed to create test annotation
            </span>
          )}
        </div>
      </section>

      {/* Recent annotations table */}
      <section className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="border-b border-zinc-200 px-8 py-5 dark:border-zinc-800">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Recent Annotations</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Latest Grafana annotations created for SorobanCrashLab fuzzing runs.
          </p>
        </div>

        {recentAnnotations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg className="mb-4 h-12 w-12 text-zinc-300 dark:text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 17v-2a2 2 0 012-2h2a2 2 0 012 2v2m-9 4h14a2 2 0 002-2V7.414a2 2 0 00-.586-1.414l-3.414-3.414A2 2 0 0014.586 2H5a2 2 0 00-2 2v15a2 2 0 002 2z" />
            </svg>
            <p className="font-semibold text-zinc-400 dark:text-zinc-600">No annotations yet</p>
            <p className="text-sm text-zinc-400 dark:text-zinc-600">
              Grafana annotations will appear here once a fuzzing run event is recorded.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                <tr>
                  {["Run ID", "Text", "Status", "Time", "Grafana ID"].map((heading) => (
                    <th scope="col"
                      key={heading}
                      className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {recentAnnotations.map((annotation) => (
                  <tr
                    key={annotation.id}
                    className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <td className="px-6 py-4 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                      {annotation.runId}
                    </td>
                    <td className="max-w-[280px] truncate px-6 py-4 text-xs text-zinc-700 dark:text-zinc-300">
                      {annotation.text}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                          STATUS_BADGE[annotation.status] ?? ""
                        }`}
                      >
                        {annotationStatusLabel(annotation.status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-xs text-zinc-500 dark:text-zinc-400">
                      {formatAnnotationTimestamp(annotation.time)}
                    </td>
                    <td className="px-6 py-4">
                      {annotation.grafanaAnnotationId ? (
                        <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                          {annotation.grafanaAnnotationId}
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-400 dark:text-zinc-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* How it works */}
      <section className="rounded-2xl border border-zinc-200 bg-white px-8 py-6 dark:border-zinc-800 dark:bg-zinc-900/50">
        <h2 className="mb-4 text-lg font-bold text-zinc-900 dark:text-white">How It Works</h2>
        <ol className="space-y-4">
          {[
            {
              step: "1",
              title: "Run lifecycle event occurs",
              detail: "When a fuzzing run starts, fails, or completes, the crash-lab engine emits a lifecycle event.",
            },
            {
              step: "2",
              title: "Annotation payload built",
              detail: "A Grafana Annotations API payload is built with the run ID, event text, timestamp, and configured tags.",
            },
            {
              step: "3",
              title: "Annotation posted to Grafana",
              detail: "The server posts the annotation to your Grafana instance using your API token, optionally scoped to a dashboard.",
            },
            {
              step: "4",
              title: "Marker appears on dashboards",
              detail: "The event appears as a timeline marker on any Grafana panel matching the annotation's tags.",
            },
          ].map(({ step, title, detail }) => (
            <li key={step} className="flex items-start gap-4">
              <span className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                {step}
              </span>
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">{title}</p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
