'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import {
  ALERTING_TABS,
  buildAlertingSettingsSummary,
  createDefaultAlertingSettingsSnapshot,
  filterAlertRulesByCategory,
  formatRelativeTime,
  getNextAlertingTab,
  serializeAlertingSettingsSnapshot,
  toggleAlertRule,
  toggleNotificationChannel,
  updateAlertRuleThreshold,
  validateAlertingSettingsSnapshot,
  type AlertCategory,
  type AlertingSettingsSnapshot,
  type AlertingTabId,
  type DryRunEvaluation,
} from './alerting-settings-page-utils';
import { evaluateRules } from './alerting-evaluator';

const ALERTING_API_URL = '/api/settings/alerting';

interface AlertingSettingsPageProps {
  className?: string;
}

type AlertRulesCategory = AlertCategory | 'all';

const CATEGORY_OPTIONS: Array<{ value: AlertRulesCategory; label: string }> = [
  { value: 'all', label: 'All categories' },
  { value: 'performance', label: 'Performance' },
  { value: 'reliability', label: 'Reliability' },
  { value: 'security', label: 'Security' },
  { value: 'resource', label: 'Resource' },
];

const CATEGORY_COLORS: Record<AlertRulesCategory, string> = {
  all: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  performance: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  reliability: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  security: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  resource: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

const SEVERITY_COLORS = {
  low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  critical: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
} as const;

const OUTCOME_STYLES = {
  triggered: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  suppressed: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  resolved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
} as const;

const TONE_STYLES: Record<'success' | 'error' | 'info', string> = {
  success:
    'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300',
  error:
    'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300',
  info:
    'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300',
};

const CHANNEL_LABELS: Record<string, string> = {
  email: 'Email',
  slack: 'Slack',
  webhook: 'Webhook',
  sms: 'SMS',
};

function LoadingSkeleton() {
  return (
    <div
      className="w-full rounded-2xl border border-zinc-200 bg-white/90 p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/90"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="mb-8 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        <div className="space-y-2">
          <div className="h-5 w-56 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-4 w-80 rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-24 rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60"
          />
        ))}
      </div>

      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-28 rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60"
          />
        ))}
      </div>
    </div>
  );
}

function InlineStatus({
  tone,
  children,
}: {
  tone: 'success' | 'error' | 'info';
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm ${TONE_STYLES[tone]}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      {children}
    </div>
  );
}

function formatConfigValue(value: string | string[] | number | boolean): string {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Enabled' : 'Disabled';
  return String(value);
}

export default function AlertingSettingsPage({
  className = '',
}: AlertingSettingsPageProps) {
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'success'>(
    'loading',
  );
  const [settings, setSettings] = useState<AlertingSettingsSnapshot | null>(null);
  const [selectedCategory, setSelectedCategory] =
    useState<AlertRulesCategory>('all');
  const [activeTab, setActiveTab] = useState<AlertingTabId>('rules');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [dryRunResults, setDryRunResults] = useState<DryRunEvaluation[] | null>(null);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [dryRunError, setDryRunError] = useState<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const tabButtonRefs = useRef<Partial<Record<AlertingTabId, HTMLButtonElement | null>>>(
    {},
  );

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const applySnapshot = useCallback((snapshot: AlertingSettingsSnapshot) => {
    setSettings(snapshot);
    setErrorMessage(null);
    setLoadState('success');
    setStatusMessage(null);
  }, []);

  const scheduleLoad = useCallback(() => {
    setLoadState('loading');
    setErrorMessage(null);
    setStatusMessage(null);

    fetch(ALERTING_API_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json().then((json) => (json as { data: AlertingSettingsSnapshot }).data);
      })
      .then(applySnapshot)
      .catch(() => {
        setSettings(null);
        setErrorMessage('Unable to load alerting settings.');
        setLoadState('error');
      });
  }, [applySnapshot]);

  useEffect(() => {
    fetch(ALERTING_API_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json().then((json) => (json as { data: AlertingSettingsSnapshot }).data);
      })
      .then(applySnapshot)
      .catch(() => {
        setSettings(null);
        setErrorMessage('Unable to load alerting settings.');
        setLoadState('error');
      });

    return clearSaveTimer;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (statusMessage === null) return;
    clearSaveTimer();
    saveTimerRef.current = window.setTimeout(() => {
      setStatusMessage(null);
    }, 2200);
    return clearSaveTimer;
  }, [clearSaveTimer, statusMessage]);

  const summary = useMemo(() => {
    if (!settings) return null;
    return buildAlertingSettingsSummary(settings);
  }, [settings]);

  const filteredRules = useMemo(() => {
    if (!settings) return [];
    return filterAlertRulesByCategory(settings.alertRules, selectedCategory);
  }, [selectedCategory, settings]);

  const visibleHistory = useMemo(() => {
    if (!settings) return [];
    return [...settings.history].sort(
      (left, right) =>
        Date.parse(right.occurredAt) - Date.parse(left.occurredAt),
    );
  }, [settings]);

  const handleTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, tabId: AlertingTabId) => {
      const nextTab = getNextAlertingTab(tabId, event.key);
      if (nextTab === tabId) return;

      event.preventDefault();
      setActiveTab(nextTab);
      window.requestAnimationFrame(() => {
        tabButtonRefs.current[nextTab]?.focus();
      });
    },
    [],
  );

  const handleRuleToggle = useCallback((ruleId: string) => {
    setSettings((current) => {
      if (!current) return current;
      const next = toggleAlertRule(current, ruleId);
      setStatusMessage(null);
      return next;
    });
  }, []);

  const handleThresholdChange = useCallback((ruleId: string, value: string) => {
    setSettings((current) => {
      if (!current) return current;
      const next = updateAlertRuleThreshold(current, ruleId, value);
      setStatusMessage(null);
      return next;
    });
  }, []);

  const handleChannelToggle = useCallback((channelId: string) => {
    setSettings((current) => {
      if (!current) return current;
      const next = toggleNotificationChannel(current, channelId);
      setStatusMessage(null);
      return next;
    });
  }, []);

  const handleSave = useCallback(() => {
    if (!settings) return;

    const validationError = validateAlertingSettingsSnapshot(settings);
    if (validationError) {
      setErrorMessage(validationError);
      setStatusMessage(null);
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);

    fetch(ALERTING_API_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: serializeAlertingSettingsSnapshot(settings),
    })
      .then((res) => {
        if (!res.ok) return res.json().then((e: { error?: string }) => { throw new Error(e.error ?? `HTTP ${res.status}`); });
        return res.json().then((json) => (json as { data: AlertingSettingsSnapshot }).data);
      })
      .then((saved) => {
        applySnapshot(saved);
        setStatusMessage('Alerting settings saved.');
      })
      .catch((err: Error) => {
        setErrorMessage(err.message ?? 'Unable to save alerting settings.');
      })
      .finally(() => setIsSaving(false));
  }, [applySnapshot, settings]);

  const handleReset = useCallback(() => {
    const defaults = createDefaultAlertingSettingsSnapshot();

    fetch(ALERTING_API_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: serializeAlertingSettingsSnapshot(defaults),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json().then((json) => (json as { data: AlertingSettingsSnapshot }).data);
      })
      .then((saved) => {
        applySnapshot(saved);
        setActiveTab('rules');
        setSelectedCategory('all');
        setStatusMessage('Alerting settings reset to defaults.');
      })
      .catch(() => {
        setErrorMessage('Unable to reset alerting settings.');
      });
  }, [applySnapshot]);

  const handleDryRun = useCallback(() => {
    if (!settings) return;

    setIsDryRunning(true);
    setDryRunError(null);
    setDryRunResults(null);

    // Simulate async evaluation with a brief delay for UX feedback
    setTimeout(() => {
      try {
        const referenceTime = new Date();
        const allRules = settings.alertRules;

        // Build synthetic runs from recent history entries as evaluation context
        const syntheticRuns = settings.history.map((entry, index) => ({
          id: `dry-run-history-${index}`,
          status: (entry.outcome === 'triggered' ? 'failed' : 'completed') as import('./types').RunStatus,
          area: 'auth' as import('./types').RunArea,
          severity: 'medium' as import('./types').RunSeverity,
          duration: 1000 + index * 500,
          seedCount: 100 + index * 10,
          crashDetail: null,
          cpuInstructions: 50000 + index * 5000,
          memoryBytes: 1024 * 1024 + index * 256 * 1024,
          minResourceFee: 100 + index * 10,
        }));

        const results = evaluateRules(allRules, syntheticRuns, referenceTime);
        setDryRunResults(results);
      } catch {
        setDryRunError('Dry-run evaluation failed. Please try again.');
      } finally {
        setIsDryRunning(false);
      }
    }, 300);
  }, [settings]);

  if (loadState === 'loading') {
    return <LoadingSkeleton />;
  }

  if (loadState === 'error') {
    return (
      <div
        className={`w-full rounded-2xl border border-zinc-200 bg-white/95 p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/90 ${className}`}
      >
        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
            <svg
              className="h-5 w-5"
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
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
              Alerting Settings
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              The dashboard could not load your saved alerting configuration.
            </p>
          </div>
        </div>

        <InlineStatus tone="error">{errorMessage}</InlineStatus>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={scheduleLoad}
            className="inline-flex items-center justify-center rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Retry loading
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center justify-center rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Reset to defaults
          </button>
        </div>
      </div>
    );
  }

  if (!settings || !summary) {
    return null;
  }

  const validationError = validateAlertingSettingsSnapshot(settings);

  return (
    <section
      className={`w-full rounded-3xl border border-zinc-200 bg-white/95 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/90 ${className}`}
      aria-labelledby="alerting-settings-heading"
    >
      <div className="border-b border-zinc-200 px-6 py-6 dark:border-zinc-800 sm:px-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-sm">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-rose-600 dark:text-rose-300">
                  Monitoring
                </p>
                <h1
                  id="alerting-settings-heading"
                  className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-3xl"
                >
                  Alerting Settings
                </h1>
              </div>
            </div>

            <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400 sm:text-base">
              Tune alert rules, notification channels, and review history for
              maintainers and contributors without leaving the dashboard.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/60">
              <div className="text-2xl font-bold text-zinc-950 dark:text-zinc-50">
                {summary.totalRules}
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Alert rules
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/60">
              <div className="text-2xl font-bold text-zinc-950 dark:text-zinc-50">
                {summary.activeRules}
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Enabled rules
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/60">
              <div className="text-2xl font-bold text-zinc-950 dark:text-zinc-50">
                {summary.enabledChannels}
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Channels online
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/60">
              <div className="text-2xl font-bold text-zinc-950 dark:text-zinc-50">
                {summary.criticalRules}
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Critical rules
              </div>
            </div>
          </div>
        </div>

        {statusMessage && (
          <div className="mt-5">
            <InlineStatus tone="success">{statusMessage}</InlineStatus>
          </div>
        )}

        {errorMessage && (
          <div className="mt-5">
            <InlineStatus tone="error">{errorMessage}</InlineStatus>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Last updated {formatRelativeTime(settings.lastUpdated)}.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center justify-center rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Reset to defaults
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !!validationError}
              className="inline-flex items-center justify-center rounded-xl bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              {isSaving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>

      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <div
          className="flex flex-wrap gap-2 px-6 py-4 sm:px-8"
          role="tablist"
          aria-label="Alerting settings sections"
        >
          {ALERTING_TABS.map((tabId) => {
            const isActive = activeTab === tabId;
            return (
              <button
                key={tabId}
                id={`alerting-tab-${tabId}`}
                ref={(node) => {
                  tabButtonRefs.current[tabId] = node;
                }}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`alerting-tab-panel-${tabId}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(tabId)}
                onKeyDown={(event) => handleTabKeyDown(event, tabId)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'border-rose-500 bg-rose-500 text-white shadow-sm'
                    : 'border-zinc-300 bg-white text-zinc-700 hover:border-rose-300 hover:text-rose-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-rose-800 dark:hover:text-rose-300'
                }`}
              >
                {tabId === 'rules' && 'Alert rules'}
                {tabId === 'channels' && 'Channels'}
                {tabId === 'history' && 'History'}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-6 py-6 sm:px-8">
        {activeTab === 'rules' && (
          <div
            id="alerting-tab-panel-rules"
            role="tabpanel"
            aria-labelledby="alerting-tab-rules"
          >
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                  Alert rules
                </h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Toggle rules, adjust thresholds, and keep the page responsive
                  for maintainers reviewing noisy alert flows.
                </p>
              </div>

              <label className="inline-flex items-center gap-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Category
                <select
                  value={selectedCategory}
                  onChange={(event) =>
                    setSelectedCategory(event.target.value as AlertRulesCategory)
                  }
                  className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="space-y-4">
              {filteredRules.map((rule) => (
                <article
                  key={rule.id}
                  className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/40"
                >
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex-1">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${CATEGORY_COLORS[rule.category]}`}
                        >
                          {rule.category}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${SEVERITY_COLORS[rule.severity]}`}
                        >
                          {rule.severity}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            rule.enabled
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                              : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                          }`}
                        >
                          {rule.enabled ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      <div className="mb-3">
                        <h3 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                          {rule.name}
                        </h3>
                        <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                          {rule.description}
                        </p>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <label className="space-y-2 text-sm">
                          <span className="block text-zinc-500 dark:text-zinc-400">
                            Threshold
                          </span>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              value={rule.threshold}
                              onChange={(event) =>
                                handleThresholdChange(rule.id, event.target.value)
                              }
                              className="w-28 rounded-xl border border-zinc-300 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-950"
                              aria-label={`${rule.name} threshold`}
                            />
                            <span className="text-zinc-500 dark:text-zinc-400">
                              {rule.unit}
                            </span>
                          </div>
                        </label>

                        <div className="space-y-2 text-sm">
                          <div className="text-zinc-500 dark:text-zinc-400">
                            Condition
                          </div>
                          <div className="font-medium capitalize text-zinc-950 dark:text-zinc-50">
                            {rule.condition}
                          </div>
                        </div>

                        <div className="space-y-2 text-sm">
                          <div className="text-zinc-500 dark:text-zinc-400">
                            Cooldown
                          </div>
                          <div className="font-medium text-zinc-950 dark:text-zinc-50">
                            {rule.cooldown}m
                          </div>
                        </div>

                        <div className="space-y-2 text-sm">
                          <div className="text-zinc-500 dark:text-zinc-400">
                            Last triggered
                          </div>
                          <div className="font-medium text-zinc-950 dark:text-zinc-50">
                            {formatRelativeTime(rule.lastTriggered)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-zinc-500 dark:text-zinc-400">
                          Channels:
                        </span>
                        {rule.channels.map((channel) => (
                          <span
                            key={channel}
                            className="rounded-full bg-white px-2.5 py-1 font-medium text-zinc-700 shadow-sm dark:bg-zinc-950 dark:text-zinc-300"
                          >
                            {CHANNEL_LABELS[channel] ?? channel}
                          </span>
                        ))}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-zinc-500 dark:text-zinc-400">
                          Tags:
                        </span>
                        {rule.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-cyan-100 px-2.5 py-1 font-medium text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 xl:flex-col xl:items-end">
                      <button
                        type="button"
                        onClick={() => handleRuleToggle(rule.id)}
                        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-transparent transition focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-950 ${
                          rule.enabled
                            ? 'bg-rose-600'
                            : 'bg-zinc-200 dark:bg-zinc-700'
                        }`}
                        aria-pressed={rule.enabled}
                        aria-label={`Toggle ${rule.name}`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
                            rule.enabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </article>
              ))}

              {filteredRules.length === 0 && (
                <InlineStatus tone="info">
                  No alert rules match the selected category.
                </InlineStatus>
              )}
            </div>
          </div>
        )}

        {activeTab === 'channels' && (
          <div
            id="alerting-tab-panel-channels"
            role="tabpanel"
            aria-labelledby="alerting-tab-channels"
          >
            <div className="mb-6 max-w-2xl">
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                Notification channels
              </h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Keep delivery routes accessible and readable so the team can
                verify where alerts go at a glance.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {settings.channels.map((channel) => (
                <article
                  key={channel.id}
                  className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/40"
                >
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                        {channel.name}
                      </h3>
                      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                        {CHANNEL_LABELS[channel.type] ?? channel.type} delivery
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleChannelToggle(channel.id)}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-transparent transition focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-950 ${
                        channel.enabled
                          ? 'bg-rose-600'
                          : 'bg-zinc-200 dark:bg-zinc-700'
                      }`}
                      aria-pressed={channel.enabled}
                      aria-label={`Toggle ${channel.name}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
                          channel.enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="space-y-2 text-sm">
                    {Object.entries(channel.config).map(([key, value]) => (
                      <div key={key} className="flex items-start justify-between gap-4">
                        <span className="text-zinc-500 dark:text-zinc-400">
                          {key}
                        </span>
                        <span className="max-w-[70%] text-right font-medium text-zinc-950 dark:text-zinc-50">
                          {formatConfigValue(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div
            id="alerting-tab-panel-history"
            role="tabpanel"
            aria-labelledby="alerting-tab-history"
          >
            <div className="mb-6 max-w-2xl">
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                Alert history
              </h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Recent alert activity gives maintainers a quick trace of what
                happened and when.
              </p>
            </div>

            {visibleHistory.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-400">
                No history entries are available yet.
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Time</th>
                      <th className="px-4 py-3 font-semibold">Rule</th>
                      <th className="px-4 py-3 font-semibold">Outcome</th>
                      <th className="px-4 py-3 font-semibold">Channel</th>
                      <th className="px-4 py-3 font-semibold">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
                    {visibleHistory.map((entry) => (
                      <tr key={entry.id}>
                        <td className="whitespace-nowrap px-4 py-3 text-zinc-500 dark:text-zinc-400">
                          {formatRelativeTime(entry.occurredAt)}
                        </td>
                        <td className="px-4 py-3 font-medium text-zinc-950 dark:text-zinc-50">
                          {entry.ruleName}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${OUTCOME_STYLES[entry.outcome]}`}
                          >
                            {entry.outcome}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                          {CHANNEL_LABELS[entry.channel] ?? entry.channel}
                        </td>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                          {entry.detail}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Dry-run evaluation panel */}
            <div className="mt-8">
              <div className="mb-4 max-w-2xl">
                <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                  Evaluate rules against history
                </h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Run a dry-run evaluation to see which rules would trigger based
                  on current rule configuration and recent history context.
                </p>
              </div>

              <button
                type="button"
                onClick={handleDryRun}
                disabled={isDryRunning}
                className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                {isDryRunning ? 'Evaluating...' : 'Run dry-run evaluation'}
              </button>

              {dryRunError && (
                <div className="mt-3">
                  <InlineStatus tone="error">{dryRunError}</InlineStatus>
                </div>
              )}

              {dryRunResults !== null && dryRunResults.length > 0 && (
                <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
                  <table className="w-full border-collapse text-sm">
                    <thead className="bg-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Rule</th>
                        <th className="px-4 py-3 font-semibold">Outcome</th>
                        <th className="px-4 py-3 font-semibold">Condition</th>
                        <th className="px-4 py-3 font-semibold">Value</th>
                        <th className="px-4 py-3 font-semibold">Detail</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
                      {dryRunResults.map((result) => (
                        <tr key={result.ruleId}>
                          <td className="px-4 py-3 font-medium text-zinc-950 dark:text-zinc-50">
                            {result.ruleName}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                result.outcome === 'would-trigger'
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                                  : result.outcome === 'cooldown-blocked'
                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                              }`}
                            >
                              {result.outcome}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                            {result.matchedCondition}
                          </td>
                          <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                            {result.matchedValue.toFixed(2)} / {result.threshold}{' '}
                            {result.unit}
                          </td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                            {result.detail}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {dryRunResults !== null && dryRunResults.length === 0 && (
                <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-400">
                  No rules to evaluate. Add or enable alert rules first.
                </div>
              )}
            </div>
          </div>
        )}

        {validationError && (
          <div className="mt-6">
            <InlineStatus tone="error">{validationError}</InlineStatus>
          </div>
        )}
      </div>
    </section>
  );
}
