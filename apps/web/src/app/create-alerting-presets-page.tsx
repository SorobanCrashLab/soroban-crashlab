'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ALERT_PRESETS,
  applyPreset,
  buildPresetsFromExisting,
  getPresetChannels,
  getPresetStatus,
  type AlertPreset,
  type PresetId,
  type PresetStatus,
} from './alerting-presets-utils';
import {
  createDefaultAlertingSettingsSnapshot,
  type AlertingSettingsSnapshot,
  type AlertCategory,
  type AlertSeverity,
} from './alerting-settings-page-utils';

const ALERTING_API_URL = '/api/settings/alerting';

const CATEGORY_COLORS: Record<AlertCategory, string> = {
  performance: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  reliability: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  security: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  resource: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  critical: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
};

const STATUS_LABELS: Record<PresetStatus, string> = {
  available: 'Available',
  applied: 'Applied',
  partial: 'Partial',
};

const STATUS_STYLES: Record<PresetStatus, string> = {
  available: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  applied: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  partial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

const CHANNEL_ICONS: Record<string, string> = {
  email: '✉',
  slack: '#',
  webhook: '⚡',
  sms: '◉',
};

interface PresetCardProps {
  preset: AlertPreset;
  status: PresetStatus;
  applying: boolean;
  onApply: (id: PresetId) => void;
  onPreview: (preset: AlertPreset) => void;
}

function PresetCard({ preset, status, applying, onApply, onPreview }: PresetCardProps) {
  const channels = useMemo(() => getPresetChannels(preset), [preset]);

  return (
    <div className="card card-padding flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              {preset.name}
            </h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[status]}`}>
              {STATUS_LABELS[status]}
            </span>
          </div>
          <p className="text-meta text-xs leading-relaxed">{preset.description}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className={`px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[preset.category]}`}>
          {preset.category}
        </span>
        <span className={`px-2 py-0.5 rounded-full font-medium ${SEVERITY_COLORS[preset.severity]}`}>
          {preset.severity}
        </span>
        <span className="px-2 py-0.5 rounded-full font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          {preset.ruleCount} {preset.ruleCount === 1 ? 'rule' : 'rules'}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-meta">Channels:</span>
        <div className="flex gap-1.5">
          {channels.map((ch) => (
            <span
              key={ch}
              title={ch}
              className="inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {CHANNEL_ICONS[ch] ?? ch[0].toUpperCase()}
            </span>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-1 border-t border-[var(--border)]">
        <button
          type="button"
          onClick={() => onPreview(preset)}
          className="flex-1 text-xs px-3 py-2 rounded-lg border border-[var(--border)] font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          style={{ color: 'var(--text-secondary)' }}
        >
          Preview rules
        </button>
        <button
          type="button"
          disabled={applying || status === 'applied'}
          onClick={() => onApply(preset.id)}
          className="flex-1 text-xs px-3 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: status === 'applied' ? 'var(--border)' : '#0A66C2',
            color: status === 'applied' ? 'var(--text-secondary)' : '#fff',
          }}
        >
          {applying ? 'Applying…' : status === 'applied' ? 'Already applied' : 'Apply preset'}
        </button>
      </div>
    </div>
  );
}

interface PreviewDrawerProps {
  preset: AlertPreset | null;
  onClose: () => void;
}

function PreviewDrawer({ preset, onClose }: PreviewDrawerProps) {
  if (!preset) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${preset.name}`}
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full sm:max-w-lg bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 max-h-[80vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
              {preset.name}
            </h2>
            <p className="text-meta text-xs mt-0.5">{preset.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-meta hover:text-[var(--text-primary)] transition-colors text-lg leading-none"
            aria-label="Close preview"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          {preset.rules.map((rule) => (
            <div key={rule.id} className="p-3 rounded-xl border border-[var(--border)] bg-zinc-50 dark:bg-zinc-800/50">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                  {rule.name}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${SEVERITY_COLORS[rule.severity]}`}>
                  {rule.severity}
                </span>
              </div>
              <p className="text-meta text-xs mb-2">{rule.description}</p>
              <div className="flex flex-wrap gap-1.5 text-xs">
                <span className="px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 font-medium">
                  {rule.condition}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 font-medium">
                  threshold: {rule.threshold} {rule.unit}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 font-medium">
                  cooldown: {rule.cooldown}m
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AlertingPresetsPage() {
  const [snapshot, setSnapshot] = useState<AlertingSettingsSnapshot | null>(null);
  const [applyingId, setApplyingId] = useState<PresetId | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [previewPreset, setPreviewPreset] = useState<AlertPreset | null>(null);

  useEffect(() => {
    fetch(ALERTING_API_URL)
      .then((r) => r.json())
      .then((data) => setSnapshot(data as AlertingSettingsSnapshot))
      .catch(() => setSnapshot(createDefaultAlertingSettingsSnapshot()));
  }, []);

  const existingRuleIds = useMemo(
    () => new Set((snapshot?.alertRules ?? []).map((r) => r.id)),
    [snapshot],
  );

  const presetEntries = useMemo(
    () => buildPresetsFromExisting(existingRuleIds),
    [existingRuleIds],
  );

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const handleApply = useCallback(
    async (id: PresetId) => {
      if (!snapshot) return;
      const preset = ALERT_PRESETS.find((p) => p.id === id);
      if (!preset) return;

      setApplyingId(id);
      try {
        const result = applyPreset(preset, snapshot.alertRules);
        const newRules = preset.rules
          .filter((r) => result.addedRuleIds.includes(r.id))
          .map((r) => ({ ...r, createdAt: new Date().toISOString() }));

        const updated: AlertingSettingsSnapshot = {
          ...snapshot,
          alertRules: [...snapshot.alertRules, ...newRules],
          lastUpdated: new Date().toISOString(),
        };

        const res = await fetch(ALERTING_API_URL, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated),
        });

        if (!res.ok) throw new Error('Save failed');
        setSnapshot(updated);
        showToast(
          result.addedRuleIds.length > 0
            ? `Applied "${preset.name}": added ${result.addedRuleIds.length} rule${result.addedRuleIds.length !== 1 ? 's' : ''}`
            : `All rules from "${preset.name}" are already active`,
          'success',
        );
      } catch {
        showToast('Failed to apply preset. Please try again.', 'error');
      } finally {
        setApplyingId(null);
      }
    },
    [snapshot, showToast],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading-page">Alerting Presets</h1>
        <p className="text-meta mt-1 text-sm">
          Apply curated rule bundles to your alerting configuration. Presets add missing rules
          without removing existing ones.
        </p>
      </div>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`px-4 py-3 rounded-xl text-sm font-medium ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 text-rose-800 dark:bg-rose-900/20 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
          }`}
        >
          {toast.message}
        </div>
      )}

      {!snapshot ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card card-padding animate-pulse h-48 bg-zinc-100 dark:bg-zinc-800" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {presetEntries.map(({ preset, status }) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              status={status}
              applying={applyingId === preset.id}
              onApply={handleApply}
              onPreview={setPreviewPreset}
            />
          ))}
        </div>
      )}

      <div className="card card-padding">
        <h2 className="font-semibold text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
          How presets work
        </h2>
        <ul className="space-y-2 text-sm text-meta">
          <li className="flex gap-2">
            <span className="shrink-0">•</span>
            <span>Presets are curated bundles of alert rules for common monitoring scenarios.</span>
          </li>
          <li className="flex gap-2">
            <span className="shrink-0">•</span>
            <span>Applying a preset only <strong>adds</strong> missing rules — your existing configuration is never removed.</span>
          </li>
          <li className="flex gap-2">
            <span className="shrink-0">•</span>
            <span><strong>Applied</strong> means all rules in the preset are already active. <strong>Partial</strong> means some rules are already present.</span>
          </li>
          <li className="flex gap-2">
            <span className="shrink-0">•</span>
            <span>After applying, manage individual rules on the <a href="/settings/alerting" className="underline" style={{ color: '#0A66C2' }}>Alerting settings</a> page.</span>
          </li>
        </ul>
      </div>

      <PreviewDrawer preset={previewPreset} onClose={() => setPreviewPreset(null)} />
    </div>
  );
}
