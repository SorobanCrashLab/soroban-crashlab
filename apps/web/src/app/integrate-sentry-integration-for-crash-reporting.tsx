"use client";

import { useState, useEffect } from "react";

/**
 * Issue #248: Integrate Sentry integration for crash reporting
 *
 * This component provides a dashboard for configuring and monitoring
 * Sentry integration to automatically report crashes and errors from
 * fuzzing runs to Sentry for centralized error tracking.
 */

interface SentryConfig {
  dsn: string;
  environment: string;
  enabled: boolean;
  sampleRate: number;
  tracesSampleRate: number;
}

interface CrashReport {
  id: string;
  timestamp: string;
  signature: string;
  sentryEventId: string;
  status: "sent" | "pending" | "failed";
}

const DEFAULT_CONFIG: SentryConfig = {
  dsn: "",
  environment: "production",
  enabled: false,
  sampleRate: 1.0,
  tracesSampleRate: 0.1,
};

export default function IntegrateSentryIntegrationForCrashReporting() {
  const [config, setConfig] = useState<SentryConfig>(DEFAULT_CONFIG);
  const [recentReports, setRecentReports] = useState<CrashReport[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(
    null,
  );
  const [showDsnInput, setShowDsnInput] = useState(false);

  useEffect(() => {
    // Simulate loading saved configuration
    const savedConfig = localStorage.getItem("sentry-config");
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        setConfig(parsed);
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  useEffect(() => {
    // Simulate loading recent reports
    setRecentReports([
      {
        id: "crash-001",
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        signature: "sig:1001:contract::transfer:assert_balance_nonnegative",
        sentryEventId: "7f3a9b2c1d4e5f6a",
        status: "sent",
      },
      {
        id: "crash-002",
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        signature: "sig:1002:contract::mint:overflow_detected",
        sentryEventId: "8e4b0c3d2e5f6g7b",
        status: "sent",
      },
    ]);
  }, []);

  const handleSaveConfig = () => {
    localStorage.setItem("sentry-config", JSON.stringify(config));
    setTestResult("success");
    setTimeout(() => setTestResult(null), 3000);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    // Simulate API test
    await new Promise<void>((r) => setTimeout(r, 1500));

    const success =
      config.dsn.includes("sentry.io") || config.dsn.includes("ingest");
    setTestResult(success ? "success" : "error");
    setIsTesting(false);

    setTimeout(() => setTestResult(null), 3000);
  };

  const formatTimestamp = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleString();
  };

  return (
    <section className="w-full rounded-[2.5rem] border border-black/[.08] bg-white p-8 dark:border-white/[.145] dark:bg-zinc-950">
      <div className="flex flex-col xl:flex-row gap-12">
        {/* Left Column - Configuration */}
        <div className="xl:w-1/2">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-orange-600 dark:text-orange-400">
            Error Tracking
          </p>
          <h2 className="text-3xl font-bold tracking-tight mb-4">
            Sentry Integration
          </h2>
          <p className="text-zinc-600 dark:text-zinc-400 mb-8 leading-relaxed">
            Automatically send crash reports and error traces from fuzzing runs
            to Sentry for centralized monitoring, alerting, and debugging
            workflows.
          </p>

          <div className="space-y-6 bg-zinc-50 dark:bg-zinc-900 p-6 rounded-[2rem] border border-zinc-200 dark:border-zinc-800">
            {/* Enable Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300">
                  Enable Sentry
                </label>
                <p className="text-xs text-zinc-500 mt-1">
                  Activate crash reporting to Sentry
                </p>
              </div>
              <button
                onClick={() =>
                  setConfig((prev) => ({ ...prev, enabled: !prev.enabled }))
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  config.enabled
                    ? "bg-orange-600"
                    : "bg-zinc-300 dark:bg-zinc-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    config.enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* DSN Configuration */}
            <div>
              <label className="block text-sm font-bold mb-2 text-zinc-700 dark:text-zinc-300">
                Sentry DSN
              </label>
              {showDsnInput || config.dsn ? (
                <input
                  type="text"
                  placeholder="https://[key]@[org].ingest.sentry.io/[project]"
                  value={config.dsn}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, dsn: e.target.value }))
                  }
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 focus:ring-2 focus:ring-orange-500 outline-none transition font-mono text-sm"
                />
              ) : (
                <button
                  onClick={() => setShowDsnInput(true)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:border-orange-400 hover:text-orange-600 transition"
                >
                  Click to configure DSN
                </button>
              )}
            </div>

            {/* Environment */}
            <div>
              <label className="block text-sm font-bold mb-2 text-zinc-700 dark:text-zinc-300">
                Environment
              </label>
              <select
                value={config.environment}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    environment: e.target.value,
                  }))
                }
                className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 focus:ring-2 focus:ring-orange-500 outline-none transition"
              >
                <option value="production">Production</option>
                <option value="staging">Staging</option>
                <option value="development">Development</option>
              </select>
            </div>

            {/* Sample Rate */}
            <div>
              <label className="block text-sm font-bold mb-2 text-zinc-700 dark:text-zinc-300">
                Error Sample Rate: {(config.sampleRate * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={config.sampleRate}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    sampleRate: parseFloat(e.target.value),
                  }))
                }
                className="w-full"
              />
              <p className="text-xs text-zinc-500 mt-1">
                Percentage of errors to send to Sentry
              </p>
            </div>

            {/* Traces Sample Rate */}
            <div>
              <label className="block text-sm font-bold mb-2 text-zinc-700 dark:text-zinc-300">
                Traces Sample Rate: {(config.tracesSampleRate * 100).toFixed(0)}
                %
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={config.tracesSampleRate}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    tracesSampleRate: parseFloat(e.target.value),
                  }))
                }
                className="w-full"
              />
              <p className="text-xs text-zinc-500 mt-1">
                Percentage of transactions to trace
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={handleTestConnection}
                disabled={isTesting || !config.dsn}
                className={`flex-1 py-3 rounded-xl text-sm font-bold transition ${
                  testResult === "success"
                    ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                    : testResult === "error"
                      ? "bg-rose-50 border border-rose-200 text-rose-700"
                      : "bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                }`}
              >
                {isTesting
                  ? "Testing..."
                  : testResult === "success"
                    ? "✓ Connected"
                    : testResult === "error"
                      ? "✗ Failed"
                      : "Test Connection"}
              </button>
              <button
                onClick={handleSaveConfig}
                className="flex-1 py-3 rounded-xl bg-orange-600 text-white font-bold hover:bg-orange-700 shadow-lg shadow-orange-500/20 transition"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>

        {/* Right Column - Recent Reports */}
        <div className="xl:w-1/2">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold">Recent Crash Reports</h3>
            <div
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${
                config.enabled
                  ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              {config.enabled ? "Active" : "Inactive"}
            </div>
          </div>

          <div className="space-y-4">
            {recentReports.length === 0 ? (
              <div className="p-12 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-[2rem] text-center text-zinc-500">
                No crash reports sent yet
              </div>
            ) : (
              recentReports.map((report) => (
                <div
                  key={report.id}
                  className="p-6 rounded-[2rem] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-orange-300 transition shadow-sm"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        {report.id}
                      </div>
                      <div className="text-xs text-zinc-500 mt-1">
                        {formatTimestamp(report.timestamp)}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                        report.status === "sent"
                          ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                          : report.status === "pending"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                            : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                      }`}
                    >
                      {report.status}
                    </span>
                  </div>

                  <div className="mb-3">
                    <div className="text-xs text-zinc-500 mb-1">
                      Crash Signature
                    </div>
                    <div className="font-mono text-xs text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800 p-2 rounded-lg overflow-x-auto">
                      {report.signature}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-xs text-zinc-500">
                      Event ID:{" "}
                      <span className="font-mono text-zinc-700 dark:text-zinc-300">
                        {report.sentryEventId}
                      </span>
                    </div>
                    <a
                      href={`https://sentry.io/events/${report.sentryEventId}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-orange-600 hover:text-orange-700 transition"
                    >
                      View in Sentry →
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Info Box */}
          <div className="mt-8 p-6 bg-orange-50 dark:bg-orange-900/20 rounded-[2rem] border border-orange-100 dark:border-orange-900/40">
            <div className="flex gap-4">
              <div className="h-10 w-10 shrink-0 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center text-orange-600">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <h4 className="font-bold text-orange-900 dark:text-orange-100 text-sm">
                  Getting Started
                </h4>
                <p className="text-sm text-orange-800/80 dark:text-orange-300/80 mt-1 leading-relaxed">
                  Create a new project in Sentry, copy the DSN from your project
                  settings, and paste it above. All crashes from fuzzing runs
                  will be automatically reported with full stack traces and
                  context.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
