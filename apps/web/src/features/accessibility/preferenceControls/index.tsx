'use client';

/**
 * preferenceControls — modular personalization controls for visual, motion,
 * cognitive, spacing/density, focus indicator, pointer target, keyboard
 * navigation, and complex-view assistive modes (#2317).
 */

import React from 'react';
import {
  DEFAULT_ASSISTIVE_MODE_PREFS,
  type AccessibilityPrefs,
  type AssistiveModePrefs,
  type ContrastPref,
  type DensityPref,
  type FocusIndicatorPref,
  type KeyboardNavigationPref,
  type LineHeightPref,
  type MotionPref,
  type PointerTargetPref,
  type TextScale,
} from '@/lib/accessibility-prefs';

export interface PreferenceControlsProps {
  prefs: AccessibilityPrefs;
  mounted: boolean;
  onUpdatePrefs: (patch: Partial<AccessibilityPrefs>) => void;
  onUpdateAssistiveModes: (patch: Partial<AssistiveModePrefs>) => void;
}

const TEXT_SCALES: readonly TextScale[] = [100, 112, 125, 150];
const MOTION_OPTIONS: readonly MotionPref[] = ['system', 'reduced', 'full'];
const CONTRAST_OPTIONS: readonly ContrastPref[] = ['standard', 'high'];
const LINE_HEIGHT_OPTIONS: readonly { id: LineHeightPref; label: string }[] = [
  { id: 'normal', label: 'Normal (1.5x)' },
  { id: 'relaxed', label: 'Relaxed (1.75x)' },
  { id: 'spacious', label: 'Spacious (2.0x)' },
];
const DENSITY_OPTIONS: readonly { id: DensityPref; label: string }[] = [
  { id: 'compact', label: 'Compact' },
  { id: 'comfortable', label: 'Comfortable' },
  { id: 'spacious', label: 'Spacious' },
];
const FOCUS_OPTIONS: readonly { id: FocusIndicatorPref; label: string }[] = [
  { id: 'default', label: 'Default ring' },
  { id: 'enhanced', label: 'Enhanced (3px)' },
  { id: 'high-visibility', label: 'High-visibility dual ring' },
];
const POINTER_OPTIONS: readonly { id: PointerTargetPref; label: string }[] = [
  { id: 'standard', label: 'Standard (24px+)' },
  { id: 'large', label: 'Expanded (44px+ WCAG AAA)' },
];
const KEYBOARD_OPTIONS: readonly { id: KeyboardNavigationPref; label: string }[] = [
  { id: 'standard', label: 'Standard Tab order' },
  { id: 'enhanced-shortcuts', label: 'Enhanced shortcut hints' },
  { id: 'roving-grid', label: 'Roving grid & landmark jump' },
];

export function PreferenceControls({
  prefs,
  mounted,
  onUpdatePrefs,
  onUpdateAssistiveModes,
}: PreferenceControlsProps) {
  const modes = prefs.assistiveModes ?? DEFAULT_ASSISTIVE_MODE_PREFS;
  const lineHeight = prefs.lineHeight ?? 'normal';
  const density = prefs.density ?? 'comfortable';
  const focusIndicator = prefs.focusIndicator ?? 'default';
  const pointerTarget = prefs.pointerTarget ?? 'standard';
  const keyboardNav = prefs.keyboardNavigation ?? 'standard';

  return (
    <div className="space-y-6" data-testid="accessibility-preference-controls">
      {/* Core Motion Control (WCAG 2.3.3) */}
      <section aria-labelledby="a11y-motion" className="card card-padding">
        <h2 id="a11y-motion" className="heading-section mb-1">
          Motion
        </h2>
        <p className="text-meta mb-4">
          Reduced disables scroll/animation effects (WCAG 2.3.3).
        </p>
        <div
          role="radiogroup"
          aria-label="Motion preference"
          className="flex flex-wrap gap-2"
        >
          {MOTION_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={prefs.motion === m}
              disabled={!mounted}
              onClick={() => onUpdatePrefs({ motion: m })}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                prefs.motion === m
                  ? 'border-[#0A66C2] bg-[#0A66C2] text-white'
                  : 'border-[var(--border-color)]'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </section>

      {/* Core Text Size Control (WCAG 1.4.4) */}
      <section aria-labelledby="a11y-text" className="card card-padding">
        <h2 id="a11y-text" className="heading-section mb-1">
          Text size
        </h2>
        <p className="text-meta mb-4">
          Root font scaling up to 150% (WCAG 1.4.4).
        </p>
        <div
          role="radiogroup"
          aria-label="Text size"
          className="flex flex-wrap gap-2"
        >
          {TEXT_SCALES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={prefs.textScale === s}
              disabled={!mounted}
              onClick={() => onUpdatePrefs({ textScale: s })}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                prefs.textScale === s
                  ? 'border-[#0A66C2] bg-[#0A66C2] text-white'
                  : 'border-[var(--border-color)]'
              }`}
            >
              {s}%
            </button>
          ))}
        </div>
      </section>

      {/* Core Contrast Control (WCAG 1.4.3 / 1.4.11) */}
      <section aria-labelledby="a11y-contrast" className="card card-padding">
        <h2 id="a11y-contrast" className="heading-section mb-1">
          Contrast
        </h2>
        <p className="text-meta mb-4">
          High-contrast token set audited for WCAG AA.
        </p>
        <div
          role="radiogroup"
          aria-label="Contrast"
          className="flex flex-wrap gap-2"
        >
          {CONTRAST_OPTIONS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={prefs.contrast === c}
              disabled={!mounted}
              onClick={() => onUpdatePrefs({ contrast: c })}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                prefs.contrast === c
                  ? 'border-[#0A66C2] bg-[#0A66C2] text-white'
                  : 'border-[var(--border-color)]'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </section>

      {/* Typography, Spacing & Density (WCAG 1.4.12) */}
      <section aria-labelledby="a11y-spacing-density" className="card card-padding space-y-5">
        <div>
          <h2 id="a11y-spacing-density" className="heading-section mb-1">
            Line height &amp; layout density
          </h2>
          <p className="text-meta">
            Tailor paragraph rhythm and table/card spacing for reading comfort (WCAG 1.4.12).
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-meta mb-2">
            Line height
          </p>
          <div
            role="radiogroup"
            aria-label="Line height preference"
            className="flex flex-wrap gap-2"
          >
            {LINE_HEIGHT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={lineHeight === opt.id}
                disabled={!mounted}
                onClick={() => onUpdatePrefs({ lineHeight: opt.id })}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  lineHeight === opt.id
                    ? 'border-[#0A66C2] bg-[#0A66C2] text-white'
                    : 'border-[var(--border-color)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-meta mb-2">
            Information density
          </p>
          <div
            role="radiogroup"
            aria-label="Density preference"
            className="flex flex-wrap gap-2"
          >
            {DENSITY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={density === opt.id}
                disabled={!mounted}
                onClick={() => onUpdatePrefs({ density: opt.id })}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  density === opt.id
                    ? 'border-[#0A66C2] bg-[#0A66C2] text-white'
                    : 'border-[var(--border-color)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Focus Visibility, Pointer Target & Keyboard Interaction (WCAG 2.4.11 / 2.5.8) */}
      <section aria-labelledby="a11y-interaction" className="card card-padding space-y-5">
        <div>
          <h2 id="a11y-interaction" className="heading-section mb-1">
            Focus visibility, pointer targets &amp; keyboard behavior
          </h2>
          <p className="text-meta">
            Configure focus ring prominence (WCAG 2.4.11), minimum pointer hit-target sizing (WCAG 2.5.8), and keyboard navigation mode.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-meta mb-2">
            Focus indicator style
          </p>
          <div
            role="radiogroup"
            aria-label="Focus indicator preference"
            className="flex flex-wrap gap-2"
          >
            {FOCUS_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={focusIndicator === opt.id}
                disabled={!mounted}
                onClick={() => onUpdatePrefs({ focusIndicator: opt.id })}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  focusIndicator === opt.id
                    ? 'border-[#0A66C2] bg-[#0A66C2] text-white'
                    : 'border-[var(--border-color)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-meta mb-2">
            Pointer target size
          </p>
          <div
            role="radiogroup"
            aria-label="Pointer target preference"
            className="flex flex-wrap gap-2"
          >
            {POINTER_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={pointerTarget === opt.id}
                disabled={!mounted}
                onClick={() => onUpdatePrefs({ pointerTarget: opt.id })}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  pointerTarget === opt.id
                    ? 'border-[#0A66C2] bg-[#0A66C2] text-white'
                    : 'border-[var(--border-color)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-meta mb-2">
            Keyboard navigation mode
          </p>
          <div
            role="radiogroup"
            aria-label="Keyboard navigation preference"
            className="flex flex-wrap gap-2"
          >
            {KEYBOARD_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={keyboardNav === opt.id}
                disabled={!mounted}
                onClick={() => onUpdatePrefs({ keyboardNavigation: opt.id })}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  keyboardNav === opt.id
                    ? 'border-[#0A66C2] bg-[#0A66C2] text-white'
                    : 'border-[var(--border-color)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Per-Surface Assistive Alternatives for Complex Views */}
      <section aria-labelledby="a11y-assistive-toggles" className="card card-padding space-y-4">
        <div>
          <h2 id="a11y-assistive-toggles" className="heading-section mb-1">
            Assistive modes for complex views
          </h2>
          <p className="text-meta">
            Enable accessible data-table alternatives, automatic summary descriptions, and non-colour pattern encoding across charts, heatmaps, and traces.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(
            [
              {
                key: 'chartDataTableAlternative',
                title: 'Data table alternatives for charts',
                desc: 'Replace or pair visual charts and graphs with accessible HTML data tables.',
              },
              {
                key: 'autoSummaryDescriptions',
                title: 'Natural-language summary descriptions',
                desc: 'Generate executive text summaries of peaks, lows, and trends for complex views.',
              },
              {
                key: 'patternShapeEncoding',
                title: 'Pattern & shape encoding',
                desc: 'Pair colour series and diff lines with distinct geometric symbols and hatch patterns (WCAG 1.4.1).',
              },
              {
                key: 'simplifiedDenseLayout',
                title: 'Simplified layout for dense views',
                desc: 'Collapse secondary telemetry columns and reduce cognitive clutter during triage.',
              },
            ] as const
          ).map((item) => {
            const active = Boolean(modes[item.key]);
            return (
              <label
                key={item.key}
                className="flex items-start gap-3 rounded-xl border border-[var(--border-color)] p-3 cursor-pointer hover:bg-[var(--hover-bg)]"
              >
                <input
                  type="checkbox"
                  checked={active}
                  disabled={!mounted}
                  onChange={(e) =>
                    onUpdateAssistiveModes({ [item.key]: e.target.checked })
                  }
                  className="mt-1"
                />
                <span className="text-xs space-y-0.5">
                  <strong className="block text-sm">{item.title}</strong>
                  <span className="text-meta block">{item.desc}</span>
                </span>
              </label>
            );
          })}
        </div>
      </section>
    </div>
  );
}
export default PreferenceControls;
