'use client';

/**
 * AccessibilityPreferencesCenter — comprehensive personalization, per-workspace
 * profile management, live assistive visualization preview, onboarding shortcut
 * guide, and assistive diagnostics center (#2317).
 */

import React from 'react';
import {
  AssistiveModesProvider,
  AssistiveVisualizationPreview,
  type AssistiveChartDatum,
} from './AssistiveModesProvider';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { useAccessibilityPrefs } from './hooks/useAccessibilityPrefs';
import { PreferenceControls } from './preferenceControls';

const SAMPLE_PREVIEW_SERIES: readonly AssistiveChartDatum[] = [
  { label: 'Token Contract (swap)', value: 86, unit: '%', category: 'Line coverage' },
  { label: 'Vault Contract (deposit)', value: 71, unit: '%', category: 'Line coverage' },
  { label: 'Oracle Contract (price)', value: 54, unit: '%', category: 'Line coverage' },
  { label: 'Auth Matrix Guard', value: 92, unit: '%', category: 'Line coverage' },
];

const SHORTCUT_HINTS = [
  { keys: 'Tab / Shift + Tab', action: 'Move focus forward or backward across interactive controls' },
  { keys: 'Arrow Keys / Home / End', action: 'Navigate WAI-ARIA tabs, radio groups, and roving data grids' },
  { keys: 'Alt + Shift + A', action: 'Jump directly to Accessibility Preferences & Assistive Modes' },
  { keys: 'Alt + Shift + D', action: 'Toggle live DOM focus & contrast diagnostics scan' },
  { keys: 'Escape', action: 'Dismiss active popovers, drawers, or modal dialogs without losing focus' },
] as const;

export function AccessibilityPreferencesCenter() {
  const state = useAccessibilityPrefs();

  return (
    <AssistiveModesProvider
      modes={state.assistiveModes}
      onToggleMode={(key, next) => state.updateAssistiveModes({ [key]: next })}
    >
      <div className="space-y-8" data-testid="accessibility-preferences-center">
        {/* Live status announcer */}
        <div role="status" aria-live="polite" className="sr-only">
          {state.statusMessage}
        </div>

        {/* Workspace Scope Switcher & Privacy Consent Bar */}
        <section
          aria-labelledby="a11y-workspace-scope-heading"
          className="card card-padding space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 id="a11y-workspace-scope-heading" className="heading-section mb-1">
                Workspace profile &amp; privacy-first persistence
              </h2>
              <p className="text-meta">
                Apply preferences globally or tailor overrides per workspace. Preferences stay strictly device-local unless you explicitly opt into cross-device sync.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-medium flex items-center gap-2">
                <span>Profile scope:</span>
                <select
                  aria-label="Select accessibility workspace scope"
                  value={state.activeScope}
                  onChange={(e) => state.setActiveScope(e.target.value)}
                  className="form-input text-xs py-1.5"
                >
                  {state.availableScopes.map((scope) => (
                    <option key={scope} value={scope}>
                      {scope === 'global' ? 'Global (All Workspaces)' : `Workspace: ${scope}`}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={state.resetScopeToDefaults}
                className="btn-outline text-xs px-3 py-1.5"
              >
                Reset profile to defaults
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--border-color)]">
            <label className="flex items-center gap-2.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={state.syncConsent}
                onChange={(e) => void state.setSyncConsent(e.target.checked)}
              />
              <span>
                <strong>Opt-in to cross-device preference sync:</strong> Allow saving my assistive preferences to the workspace profile service (never tracked for analytics).
              </span>
            </label>
            <span className="text-xs font-mono text-meta">
              Storage: {state.syncConsent ? 'Local + Consented Sync' : 'Device-Local Only'}
            </span>
          </div>
        </section>

        {/* Core Personalization & Assistive Mode Controls */}
        <PreferenceControls
          prefs={state.prefs}
          mounted={state.mounted}
          onUpdatePrefs={state.updatePrefs}
          onUpdateAssistiveModes={state.updateAssistiveModes}
        />

        {/* Live Assistive Preview Surface */}
        <section aria-labelledby="a11y-live-preview-heading" className="card card-padding space-y-4">
          <div>
            <h2 id="a11y-live-preview-heading" className="heading-section mb-1">
              Live assistive mode preview
            </h2>
            <p className="text-meta">
              Preview how complex charts and dense telemetry adapt in real time to your data-table alternative, summary description, and pattern encoding toggles.
            </p>
          </div>

          <AssistiveVisualizationPreview
            title="Contract Fuzzing Coverage Distribution"
            series={SAMPLE_PREVIEW_SERIES}
          />
        </section>

        {/* Onboarding Hints & Keyboard Shortcut Integration */}
        <section aria-labelledby="a11y-onboarding-hints-heading" className="card card-padding space-y-4">
          <div>
            <h2 id="a11y-onboarding-hints-heading" className="heading-section mb-1">
              Accessibility onboarding &amp; keyboard shortcuts
            </h2>
            <p className="text-meta">
              Built-in keyboard chords and screen-reader landmark navigation available across every CrashLab surface.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <caption className="sr-only">
                Accessibility keyboard shortcuts and navigation gestures
              </caption>
              <thead>
                <tr className="border-b border-[var(--border-color)] text-left">
                  <th scope="col" className="py-2 pr-4">Key combination</th>
                  <th scope="col" className="py-2">Behavior</th>
                </tr>
              </thead>
              <tbody>
                {SHORTCUT_HINTS.map((item) => (
                  <tr key={item.keys} className="border-b border-[var(--border-color)]">
                    <th scope="row" className="py-2 pr-4 font-mono text-left whitespace-nowrap">
                      {item.keys}
                    </th>
                    <td className="py-2">{item.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Assistive Diagnostics & Barrier Reporting Panel */}
        <DiagnosticsPanel onSubmitBarrierReport={state.submitBarrierReport} />
      </div>
    </AssistiveModesProvider>
  );
}

export default AccessibilityPreferencesCenter;
