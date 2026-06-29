"use client";

import { useState, useEffect } from "react";

import { createPagerDutyAdapter } from "@/lib/integrations/pagerduty-adapter";
import type {
  PagerDutyConfig,
  PagerDutyAlert,
  PagerDutySeverity,
} from "./integrate-pagerduty-alert-integration-utils";
import {
  validatePagerDutyConfig,
  summariseAlerts,
  formatAlertTimestamp,
  alertStatusLabel,
  severityColour,
} from "./integrate-pagerduty-alert-integration-utils";

/**
 * Issue #882 – [integration] Add PagerDuty alert integration for critical failures
 *
 * Dashboard component for configuring and monitoring the PagerDuty integration.
 * When a fuzzing run hits a critical failure the system automatically sends an
 * incident event to PagerDuty so on-call engineers are paged immediately.
 */

const SEVERITY_OPTIONS: { value: PagerDutySeverity; label: string }[] = [
  { value: "critical", label: "Critical" },
  { value: "error", label: "Error" },
  { value: "warning", label: "Warning" },
  { value: "info", label: "Info" },
];

const DEFAULT_CONFIG: PagerDutyConfig = {
  integrationKey: "",
  defaultSeverity: "critical",
  serviceSource: "SorobanCrashLab",
  enabled: false,
  alertThreshold: 1,
};

// Severity badge colour mapping (Tailwind classes).
const SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  error: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  warning: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
};

const STATUS_BADGE: Record<string, string> = {
  triggered: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  acknowledged: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300",
  resolved: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300",
};

export default function IntegratePagerdutyAlertIntegration() {
  const [config, setConfig] = useState<PagerDutyConfig>(DEFAULT_CONFIG);
  const [recentAlerts, setRecentAlerts] = useState<PagerDutyAlert[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isTriggeringTest, setIsTriggeringTest] = useState(false);
  const [triggerResult, setTriggerResult] = useState<"success" | "error" | null>(null);

  const adapter = createPagerDutyAdapter();

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
          setLoadError("Failed to load PagerDuty configuration.");
          console.error(err);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load recent alerts on mount.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const alerts = await adapter.fetchRecentAlerts();
        if (!cancelled) setRecentAlerts(alerts);
      } catch (err) {
        console.error("Failed to load recent PagerDuty alerts:", err);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = summariseAlerts(recentAlerts);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveSuccess(false);

    const validation = validatePagerDutyConfig(config);
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
      console.error("Failed to save PagerDuty config:", err);
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
      const result = await adapter.testConnection(config.integrationKey);
      setTestResult(result.success ? "success" : "error");
      if (!result.success) setTestError(result.error ?? "Connection failed");
    } finally {
      setIsTesting(false);
    }
  }

  async function handleTriggerTestAlert() {
    setIsTriggeringTest(true);
    setTriggerResult(null);

    try {
      const result = await adapter.triggerAlert({
        runId: `test-run-${Date.now()}`,
        signature: "SIGSEGV:manual-test",
        summary: "[Test] SorobanCrashLab critical failure alert – please resolve",
        severity: config.defaultSeverity,
        details: { source: "manual-trigger", via: "IntegrationsHub" },
      });
      setTriggerResult(result.success ? "success" : "error");
    } finally {
      setIsTriggeringTest(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600" />
          <p className="text-zinc-500 dark:text-zinc-400">Loading PagerDuty configuration…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">

      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="mb-3 flex items-center gap-3">
            {/* PagerDuty-inspired bell icon */}
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 dark:bg-green-900/30">
              <svg className="h-7 w-7 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </span>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
                PagerDuty Alerts
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Issue #882 · area:integrations · priority:p2
              </p>
            </div>
          </div>
          <p className="text-zinc-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
            Automatically page your on-call team when a fuzzing run encounters a critical failure.
            Incidents are dispatched via the PagerDuty Events API v2 with stable dedup-keys so
            duplicate crashes don&apos;t create noise.
          </p>
        </div>

        {/* Enabled toggle */}
        <div className="ml-6 flex flex-shrink-0 flex-col items-end gap-2">
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
        <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20 px-5 py-4 text-sm text-red-700 dark:text-red-400">
          {loadError}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total Alerts", value: summary.total, colour: "purple" },
          { label: "Triggered", value: summary.triggered, colour: "red" },
          { label: "Acknowledged", value: summary.acknowledged, colour: "yellow" },
          { label: "Resolved", value: summary.resolved, colour: "green" },
        ].map(({ label, value, colour }) => (
          <div
            key={label}
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-5"
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1">
              {label}
            </p>
            <p className={`text-3xl font-bold text-${colour}-600 dark:text-${colour}-400`}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Configuration form */}
      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50">
        <div className="border-b border-zinc-200 dark:border-zinc-800 px-8 py-5">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Configuration</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Enter your PagerDuty Events API v2 integration (routing) key and alert preferences.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-6 px-8 py-6">
          {/* Validation errors */}
          {validationErrors.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20 p-4">
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

          {/* Integration key */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Integration (Routing) Key
            </label>
            <div className="relative flex items-center gap-2">
              <input
                id="pagerduty-integration-key"
                type={showKeyInput ? "text" : "password"}
                value={config.integrationKey}
                onChange={(e) => setConfig((c) => ({ ...c, integrationKey: e.target.value }))}
                placeholder="Enter your PagerDuty integration key…"
                className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/20"
                aria-label="PagerDuty integration key"
              />
              <button
                type="button"
                onClick={() => setShowKeyInput((v) => !v)}
                className="flex-shrink-0 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
                aria-label={showKeyInput ? "Hide integration key" : "Show integration key"}
              >
                {showKeyInput ? "Hide" : "Show"}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              Found in PagerDuty → Services → Integrations → Events API v2.
            </p>
          </div>

          {/* Service source */}
          <div>
            <label
              htmlFor="pagerduty-service-source"
              className="mb-1.5 block text-sm font-semibold text-zinc-700 dark:text-zinc-300"
            >
              Service Source Name
            </label>
            <input
              id="pagerduty-service-source"
              type="text"
              value={config.serviceSource}
              onChange={(e) => setConfig((c) => ({ ...c, serviceSource: e.target.value }))}
              placeholder="SorobanCrashLab"
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/20"
            />
            <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              Displayed as the event source in PagerDuty incidents.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Default severity */}
            <div>
              <label
                htmlFor="pagerduty-default-severity"
                className="mb-1.5 block text-sm font-semibold text-zinc-700 dark:text-zinc-300"
              >
                Default Severity
              </label>
              <select
                id="pagerduty-default-severity"
                value={config.defaultSeverity}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, defaultSeverity: e.target.value as PagerDutySeverity }))
                }
                className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-white focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/20"
              >
                {SEVERITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Alert threshold */}
            <div>
              <label
                htmlFor="pagerduty-alert-threshold"
                className="mb-1.5 block text-sm font-semibold text-zinc-700 dark:text-zinc-300"
              >
                Alert Threshold (failures)
              </label>
              <input
                id="pagerduty-alert-threshold"
                type="number"
                min={1}
                max={100}
                value={config.alertThreshold}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, alertThreshold: parseInt(e.target.value, 10) || 1 }))
                }
                className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-white focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/20"
              />
              <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                Minimum consecutive failures before an alert fires.
              </p>
            </div>
          </div>

          {/* Save button */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              id="pagerduty-save-config"
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
      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50">
        <div className="border-b border-zinc-200 dark:border-zinc-800 px-8 py-5">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Connection Test</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Verify that your integration key is valid and the PagerDuty Events API is reachable.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 px-8 py-6">
          <button
            id="pagerduty-test-connection"
            type="button"
            disabled={isTesting || !config.integrationKey}
            onClick={handleTestConnection}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-5 py-2.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300 shadow-sm transition-all hover:border-purple-300 dark:hover:border-purple-700 hover:text-purple-600 dark:hover:text-purple-400 disabled:opacity-50"
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
            id="pagerduty-trigger-test-alert"
            type="button"
            disabled={isTriggeringTest || !config.integrationKey}
            onClick={handleTriggerTestAlert}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-5 py-2.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300 shadow-sm transition-all hover:border-red-300 dark:hover:border-red-700 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
          >
            {isTriggeringTest ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-red-600" />
                Triggering…
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                Send Test Alert
              </>
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
          {triggerResult === "success" && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Test alert sent — check PagerDuty
            </span>
          )}
          {triggerResult === "error" && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 dark:text-red-400">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Failed to send test alert
            </span>
          )}
        </div>
      </section>

      {/* Recent alerts table */}
      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50">
        <div className="border-b border-zinc-200 dark:border-zinc-800 px-8 py-5">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Recent Alerts</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Latest PagerDuty incidents triggered by SorobanCrashLab fuzzing runs.
          </p>
        </div>

        {recentAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg className="mb-4 h-12 w-12 text-zinc-300 dark:text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <p className="font-semibold text-zinc-400 dark:text-zinc-600">No alerts yet</p>
            <p className="text-sm text-zinc-400 dark:text-zinc-600">
              PagerDuty incidents will appear here once a critical failure is detected.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                <tr>
                  {["Run ID", "Signature", "Severity", "Status", "Triggered At", "PD Incident"].map(
                    (heading) => (
                      <th
                        key={heading}
                        className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400"
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {recentAlerts.map((alert) => {
                  const sColour = severityColour(alert.severity);
                  void sColour; // used via SEVERITY_BADGE map
                  return (
                    <tr
                      key={alert.id}
                      className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    >
                      <td className="px-6 py-4 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                        {alert.runId}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-zinc-700 dark:text-zinc-300 max-w-[200px] truncate">
                        {alert.signature}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                            SEVERITY_BADGE[alert.severity] ?? SEVERITY_BADGE.info
                          }`}
                        >
                          {alert.severity}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                            STATUS_BADGE[alert.status] ?? ""
                          }`}
                        >
                          {alertStatusLabel(alert.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                        {formatAlertTimestamp(alert.triggeredAt)}
                      </td>
                      <td className="px-6 py-4">
                        {alert.pdIncidentKey ? (
                          <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                            {alert.pdIncidentKey}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-400 dark:text-zinc-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* How it works */}
      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 px-8 py-6">
        <h2 className="mb-4 text-lg font-bold text-zinc-900 dark:text-white">How It Works</h2>
        <ol className="space-y-4">
          {[
            {
              step: "1",
              title: "Critical failure detected",
              detail: "When a fuzzing run exceeds the configured failure threshold, the crash-lab engine emits a failure event.",
            },
            {
              step: "2",
              title: "Dedup-key generated",
              detail: "A stable dedup-key is computed from the run ID and crash signature so repeat crashes won't spam on-call.",
            },
            {
              step: "3",
              title: "Incident sent to PagerDuty",
              detail: "The server posts a trigger event to the PagerDuty Events API v2 using your integration key.",
            },
            {
              step: "4",
              title: "On-call team paged",
              detail: "PagerDuty routes the incident to the correct escalation policy and notifies your on-call engineer.",
            },
          ].map(({ step, title, detail }) => (
            <li key={step} className="flex items-start gap-4">
              <span className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30 text-xs font-bold text-purple-600 dark:text-purple-400">
                {step}
              </span>
              <div>
                <p className="font-semibold text-zinc-900 dark:text-white text-sm">{title}</p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
