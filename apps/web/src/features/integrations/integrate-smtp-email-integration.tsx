"use client";

import { useState, useEffect } from "react";

import { createSmtpAdapter } from "@/lib/integrations/smtp-adapter";
import type { SmtpConfig } from "@/lib/integrations/smtp-validation";
import { validateSmtpConfig, validateEmail } from "@/lib/integrations/smtp-validation";
import type { EmailLogEntry } from "./integrate-smtp-email-integration-utils";
import {
  summariseEmailLog,
  formatEmailTimestamp,
  emailStatusLabel,
} from "./integrate-smtp-email-integration-utils";

/**
 * Issue #1088 – [integration] Implement SMTP email adapter
 *
 * Dashboard component for configuring and monitoring the SMTP email
 * integration. Critical fuzzing events (crashes, run failures) can be
 * emailed to a configured address via a standard SMTP server.
 */

const DEFAULT_CONFIG: SmtpConfig = {
  host: "",
  port: 587,
  secure: false,
  auth: { user: "", pass: "" },
  from: "",
  enabled: false,
};

const STATUS_BADGE: Record<string, string> = {
  sent: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

export default function IntegrateSmtpEmailIntegration() {
  const [config, setConfig] = useState<SmtpConfig>(DEFAULT_CONFIG);
  const [history, setHistory] = useState<EmailLogEntry[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [showPassInput, setShowPassInput] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [testRecipient, setTestRecipient] = useState("");
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [sendResult, setSendResult] = useState<"success" | "error" | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const adapter = createSmtpAdapter();

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
          setLoadError("Failed to load SMTP configuration.");
          console.error(err);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load send history on mount.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const entries = await adapter.fetchHistory();
        if (!cancelled) setHistory(entries);
      } catch (err) {
        console.error("Failed to load SMTP send history:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = summariseEmailLog(history);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveSuccess(false);

    const validationError = validateSmtpConfig(config);
    if (validationError) {
      setValidationErrors([validationError]);
      return;
    }
    setValidationErrors([]);

    setIsSaving(true);
    try {
      await adapter.saveConfig(config);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save SMTP config:", err);
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
      const result = await adapter.testConnection(config);
      setTestResult(result.success ? "success" : "error");
      if (!result.success) setTestError(result.error ?? "Connection failed");
    } finally {
      setIsTesting(false);
    }
  }

  async function handleSendTestEmail() {
    setIsSendingTest(true);
    setSendResult(null);
    setSendError(null);

    try {
      const result = await adapter.sendTestEmail({ to: testRecipient });
      setSendResult(result.success ? "success" : "error");
      if (!result.success) setSendError(result.error ?? "Failed to send test email");
      const entries = await adapter.fetchHistory();
      setHistory(entries);
    } finally {
      setIsSendingTest(false);
    }
  }

  const testRecipientValid = testRecipient.trim().length > 0 && validateEmail(testRecipient);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-sky-200 border-t-sky-600" />
          <p className="text-zinc-500 dark:text-zinc-400">Loading SMTP configuration…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Page header */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-3 flex items-center gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-900/30">
              <svg className="h-7 w-7 text-sky-600 dark:text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </span>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
                SMTP Email Integration
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Issue #1088 · area:integrations · priority:p2
              </p>
            </div>
          </div>
          <p className="text-zinc-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
            Send critical event notifications and run status updates over a standard SMTP
            connection using nodemailer.
          </p>
        </div>

        {/* Enabled toggle */}
        <div className="flex flex-shrink-0 flex-col items-start gap-2 sm:items-end">
          <label className="flex cursor-pointer items-center gap-3">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {config.enabled ? "Enabled" : "Disabled"}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={config.enabled}
              onClick={() => setConfig((c) => ({ ...c, enabled: !c.enabled }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 ${
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: "Total Sent Attempts", value: summary.total, colour: "sky" },
          { label: "Delivered", value: summary.sent, colour: "green" },
          { label: "Failed", value: summary.failed, colour: "red" },
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
            Enter your SMTP server details. Credentials are sent to the server to save and are
            never exposed to other integrations.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-6 px-8 py-6">
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

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label
                htmlFor="smtp-host"
                className="mb-1.5 block text-sm font-semibold text-zinc-700 dark:text-zinc-300"
              >
                SMTP Host
              </label>
              <input
                id="smtp-host"
                type="text"
                value={config.host}
                onChange={(e) => setConfig((c) => ({ ...c, host: e.target.value }))}
                placeholder="smtp.example.com"
                className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
              />
            </div>

            <div>
              <label
                htmlFor="smtp-port"
                className="mb-1.5 block text-sm font-semibold text-zinc-700 dark:text-zinc-300"
              >
                Port
              </label>
              <input
                id="smtp-port"
                type="number"
                min={1}
                max={65535}
                value={config.port}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, port: parseInt(e.target.value, 10) || 0 }))
                }
                className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-white focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              id="smtp-secure"
              type="checkbox"
              checked={config.secure}
              onChange={(e) => setConfig((c) => ({ ...c, secure: e.target.checked }))}
              className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 text-sky-600 focus:ring-sky-500"
            />
            <label htmlFor="smtp-secure" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Use TLS (recommended for port 465)
            </label>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label
                htmlFor="smtp-user"
                className="mb-1.5 block text-sm font-semibold text-zinc-700 dark:text-zinc-300"
              >
                Username
              </label>
              <input
                id="smtp-user"
                type="text"
                value={config.auth.user}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, auth: { ...c.auth, user: e.target.value } }))
                }
                placeholder="notifications@example.com"
                className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
              />
            </div>

            <div>
              <label
                htmlFor="smtp-pass"
                className="mb-1.5 block text-sm font-semibold text-zinc-700 dark:text-zinc-300"
              >
                Password
              </label>
              <div className="relative flex items-center gap-2">
                <input
                  id="smtp-pass"
                  type={showPassInput ? "text" : "password"}
                  value={config.auth.pass}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, auth: { ...c.auth, pass: e.target.value } }))
                  }
                  placeholder="Enter your SMTP password…"
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                  aria-label="SMTP password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassInput((v) => !v)}
                  className="flex-shrink-0 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
                  aria-label={showPassInput ? "Hide password" : "Show password"}
                >
                  {showPassInput ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="smtp-from"
              className="mb-1.5 block text-sm font-semibold text-zinc-700 dark:text-zinc-300"
            >
              From Address
            </label>
            <input
              id="smtp-from"
              type="text"
              value={config.from}
              onChange={(e) => setConfig((c) => ({ ...c, from: e.target.value }))}
              placeholder="CrashLab Alerts <alerts@example.com>"
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              id="smtp-save-config"
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 transition-all hover:bg-sky-700 disabled:opacity-50"
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
            Verify the SMTP server is reachable, then send a test email to confirm end-to-end
            delivery.
          </p>
        </div>

        <div className="space-y-4 px-8 py-6">
          <div className="flex flex-wrap items-center gap-4">
            <button
              id="smtp-test-connection"
              type="button"
              disabled={isTesting || !config.host}
              onClick={handleTestConnection}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-5 py-2.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300 shadow-sm transition-all hover:border-sky-300 dark:hover:border-sky-700 hover:text-sky-600 dark:hover:text-sky-400 disabled:opacity-50"
            >
              {isTesting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-sky-600" />
                  Testing…
                </>
              ) : (
                "Test Connection"
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
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 dark:border-zinc-800 pt-4">
            <input
              id="smtp-test-recipient"
              type="text"
              value={testRecipient}
              onChange={(e) => setTestRecipient(e.target.value)}
              placeholder="you@example.com"
              aria-label="Test email recipient"
              className="w-full max-w-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
            />
            <button
              id="smtp-send-test-email"
              type="button"
              disabled={isSendingTest || !testRecipientValid}
              onClick={handleSendTestEmail}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-5 py-2.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300 shadow-sm transition-all hover:border-sky-300 dark:hover:border-sky-700 hover:text-sky-600 dark:hover:text-sky-400 disabled:opacity-50"
            >
              {isSendingTest ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-sky-600" />
                  Sending…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Send Test Email
                </>
              )}
            </button>

            {sendResult === "success" && (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Test email sent
              </span>
            )}
            {sendResult === "error" && (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 dark:text-red-400">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                {sendError ?? "Failed to send test email"}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Recent activity table */}
      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50">
        <div className="border-b border-zinc-200 dark:border-zinc-800 px-8 py-5">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Recent Activity</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Emails sent via this SMTP integration during the current session.
          </p>
        </div>

        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg className="mb-4 h-12 w-12 text-zinc-300 dark:text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <p className="font-semibold text-zinc-400 dark:text-zinc-600">No emails sent yet</p>
            <p className="text-sm text-zinc-400 dark:text-zinc-600">
              Send a test email above, or configure critical event notifications, to see activity here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                <tr>
                  {["Recipient", "Subject", "Status", "Sent At", "Message ID"].map((heading) => (
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
                {history.map((entry) => (
                  <tr
                    key={entry.id}
                    className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <td className="px-6 py-4 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                      {entry.to}
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-700 dark:text-zinc-300 max-w-[220px] truncate">
                      {entry.subject}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                          STATUS_BADGE[entry.status] ?? ""
                        }`}
                      >
                        {emailStatusLabel(entry.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                      {formatEmailTimestamp(entry.sentAt)}
                    </td>
                    <td className="px-6 py-4">
                      {entry.status === "sent" && entry.messageId ? (
                        <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                          {entry.messageId}
                        </span>
                      ) : entry.error ? (
                        <span className="text-xs text-red-500 dark:text-red-400">{entry.error}</span>
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
      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 px-8 py-6">
        <h2 className="mb-4 text-lg font-bold text-zinc-900 dark:text-white">How It Works</h2>
        <ol className="space-y-4">
          {[
            {
              step: "1",
              title: "Configure your SMTP server",
              detail: "Enter your provider's host, port, and credentials — works with any standard SMTP server (Gmail, SES, SendGrid SMTP relay, self-hosted, etc.).",
            },
            {
              step: "2",
              title: "Verify connectivity",
              detail: "Test Connection authenticates against your SMTP server via nodemailer without sending any mail.",
            },
            {
              step: "3",
              title: "Confirm delivery",
              detail: "Send Test Email delivers a real message end-to-end so you can confirm it lands in your inbox.",
            },
            {
              step: "4",
              title: "Automated notifications",
              detail: "Once enabled, critical fuzzing events are formatted and delivered through this same integration.",
            },
          ].map(({ step, title, detail }) => (
            <li key={step} className="flex items-start gap-4">
              <span className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-900/30 text-xs font-bold text-sky-600 dark:text-sky-400">
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
