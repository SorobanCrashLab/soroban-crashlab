'use client';

/**
 * DiagnosticsPanel — in-app accessibility diagnostics (dev/support mode) for:
 * - Focus traversal order inspection
 * - Missing accessible label detection
 * - Landmark & heading hierarchy map
 * - WCAG 2.2 AA/AAA relative luminance & contrast ratio sampling
 * - Privacy-safe "Report accessibility issue" flow capturing route, component,
 *   and redacted screenshot/DOM context (#2317).
 */

import React, { useState } from 'react';
import type { BarrierReportInput } from './hooks/useAccessibilityPrefs';

export interface FocusStopItem {
  order: number;
  tag: string;
  role: string;
  accessibleName: string;
  hasVisibleLabel: boolean;
}

export interface LandmarkHeadingItem {
  kind: 'landmark' | 'heading';
  tag: string;
  level?: number;
  label: string;
}

export interface ContrastSampleItem {
  pairName: string;
  foregroundHex: string;
  backgroundHex: string;
  ratio: number;
  passesAA: boolean;
  passesAAA: boolean;
}

export interface DomDiagnosticsReport {
  scannedAt: string;
  focusStops: FocusStopItem[];
  missingLabelCount: number;
  landmarksAndHeadings: LandmarkHeadingItem[];
  headingHierarchyValid: boolean;
  contrastSamples: ContrastSampleItem[];
}

/** Parses `#RRGGBB` or `#RGB` into `[r, g, b]` in `0..255`. */
export function parseHexColor(hex: string): [number, number, number] {
  const cleaned = hex.trim().replace(/^#/, '');
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    return [
      Number.isFinite(r) ? r : 0,
      Number.isFinite(g) ? g : 0,
      Number.isFinite(b) ? b : 0,
    ];
  }
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return [
    Number.isFinite(r) ? r : 0,
    Number.isFinite(g) ? g : 0,
    Number.isFinite(b) ? b : 0,
  ];
}

/** WCAG 2.x relative luminance for an sRGB color. */
export function computeRelativeLuminance(r: number, g: number, b: number): number {
  const transform = (channel: number): number => {
    const s = Math.max(0, Math.min(255, channel)) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const R = transform(r);
  const G = transform(g);
  const B = transform(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** Computes WCAG contrast ratio (`1.0` to `21.0`) rounded to 2 decimals. */
export function computeContrastRatio(fgHex: string, bgHex: string): number {
  const [r1, g1, b1] = parseHexColor(fgHex);
  const [r2, g2, b2] = parseHexColor(bgHex);
  const l1 = computeRelativeLuminance(r1, g1, b1);
  const l2 = computeRelativeLuminance(r2, g2, b2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}

/** Validates that heading levels (`h1..h6`) do not skip levels downwards (e.g. `h1 -> h3`). */
export function validateHeadingLevels(levels: readonly number[]): boolean {
  if (levels.length === 0) return true;
  let prev = levels[0];
  for (let i = 1; i < levels.length; i += 1) {
    const curr = levels[i];
    if (curr > prev + 1) return false;
    prev = curr;
  }
  return true;
}

const DEFAULT_TOKEN_PAIRS: readonly {
  pairName: string;
  fg: string;
  bg: string;
}[] = [
  { pairName: 'Primary body text on surface', fg: '#111827', bg: '#FFFFFF' },
  { pairName: 'Active brand button (#0A66C2 on white)', fg: '#FFFFFF', bg: '#0A66C2' },
  { pairName: 'High-contrast mode text on dark canvas', fg: '#FFFFFF', bg: '#090D16' },
  { pairName: 'Secondary metadata caption', fg: '#374151', bg: '#F9FAFB' },
];

export function evaluateTokenContrastSamples(
  pairs = DEFAULT_TOKEN_PAIRS,
): ContrastSampleItem[] {
  return pairs.map((item) => {
    const ratio = computeContrastRatio(item.fg, item.bg);
    return {
      pairName: item.pairName,
      foregroundHex: item.fg,
      backgroundHex: item.bg,
      ratio,
      passesAA: ratio >= 4.5,
      passesAAA: ratio >= 7.0,
    };
  });
}

/** Runs an in-browser DOM audit of focus order, accessible names, landmarks, and headings. */
export function runLiveDomDiagnostics(rootDoc?: Document): DomDiagnosticsReport {
  const contrastSamples = evaluateTokenContrastSamples();
  const doc =
    rootDoc ?? (typeof document !== 'undefined' ? document : undefined);

  if (!doc) {
    return {
      scannedAt: new Date().toISOString(),
      focusStops: [],
      missingLabelCount: 0,
      landmarksAndHeadings: [],
      headingHierarchyValid: true,
      contrastSamples,
    };
  }

  const interactiveNodes = Array.from(
    doc.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).slice(0, 40);

  const focusStops: FocusStopItem[] = interactiveNodes.map((node, index) => {
    const tag = node.tagName.toLowerCase();
    const role = node.getAttribute('role') ?? tag;
    const ariaLabel = node.getAttribute('aria-label')?.trim();
    const text = node.textContent?.trim();
    const title = node.getAttribute('title')?.trim();
    const accessibleName = ariaLabel || text || title || '';
    return {
      order: index + 1,
      tag,
      role,
      accessibleName: accessibleName.slice(0, 60) || '(unlabelled control)',
      hasVisibleLabel: accessibleName.length > 0,
    };
  });

  const missingLabelCount = focusStops.filter((item) => !item.hasVisibleLabel).length;

  const landmarksAndHeadings: LandmarkHeadingItem[] = [];
  const headingLevels: number[] = [];

  const structureNodes = Array.from(
    doc.querySelectorAll<HTMLElement>(
      'main, nav, header, footer, aside, section[aria-label], section[aria-labelledby], h1, h2, h3, h4, h5, h6',
    ),
  ).slice(0, 35);

  for (const el of structureNodes) {
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag[1]);
      headingLevels.push(level);
      landmarksAndHeadings.push({
        kind: 'heading',
        tag,
        level,
        label: (el.textContent ?? '').trim().slice(0, 80) || `Empty <${tag}>`,
      });
    } else {
      const ariaLabel = el.getAttribute('aria-label') ?? '';
      const labelledBy = el.getAttribute('aria-labelledby');
      const refText =
        labelledBy && doc.getElementById(labelledBy)
          ? (doc.getElementById(labelledBy)?.textContent ?? '').trim()
          : '';
      landmarksAndHeadings.push({
        kind: 'landmark',
        tag,
        label: (ariaLabel || refText || `<${tag}> landmark`).slice(0, 80),
      });
    }
  }

  return {
    scannedAt: new Date().toISOString(),
    focusStops,
    missingLabelCount,
    landmarksAndHeadings,
    headingHierarchyValid: validateHeadingLevels(headingLevels),
    contrastSamples,
  };
}

export interface DiagnosticsPanelProps {
  onSubmitBarrierReport: (input: BarrierReportInput) => Promise<{ id: string } | null>;
}

export function DiagnosticsPanel({ onSubmitBarrierReport }: DiagnosticsPanelProps) {
  const [diagnosticsEnabled, setDiagnosticsEnabled] = useState<boolean>(false);
  const [report, setReport] = useState<DomDiagnosticsReport>(() =>
    runLiveDomDiagnostics(),
  );

  // Barrier Report intake form state
  const [routeInput, setRouteInput] = useState<string>('/settings/accessibility');
  const [componentInput, setComponentInput] = useState<string>(
    'AccessibilityPreferencesCenter',
  );
  const [descriptionInput, setDescriptionInput] = useState<string>('');
  const [includeDomSnapshot, setIncludeDomSnapshot] = useState<boolean>(true);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const handleRunScan = () => {
    setDiagnosticsEnabled(true);
    setReport(runLiveDomDiagnostics());
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descriptionInput.trim()) return;
    const screenshotSummary = includeDomSnapshot
      ? `FocusStops=${report.focusStops.length}; MissingLabels=${report.missingLabelCount}; HeadingHierarchyValid=${String(report.headingHierarchyValid)}`
      : undefined;

    const result = await onSubmitBarrierReport({
      route: routeInput,
      component: componentInput,
      description: descriptionInput,
      screenshotSummary,
    });
    if (result?.id) {
      setSubmittedId(result.id);
      setDescriptionInput('');
    }
  };

  return (
    <div className="space-y-6" data-testid="accessibility-diagnostics-panel">
      {/* In-App Assistive Diagnostics Overlay / Inspector */}
      <section aria-labelledby="a11y-diag-heading" className="card card-padding space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="a11y-diag-heading" className="heading-section mb-1">
              Assistive diagnostics inspector (dev &amp; support mode)
            </h2>
            <p className="text-meta">
              Inspect live focus traversal order, verify accessible labels, map landmarks/headings, and audit token contrast ratios.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRunScan}
              className="btn-primary text-xs px-3 py-1.5"
            >
              Run live DOM scan
            </button>
            <button
              type="button"
              aria-pressed={diagnosticsEnabled}
              onClick={() => setDiagnosticsEnabled((v) => !v)}
              className="btn-outline text-xs px-3 py-1.5"
            >
              {diagnosticsEnabled ? 'Hide diagnostics details' : 'Show diagnostics details'}
            </button>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-[var(--border-color)] p-3">
            <div className="text-xs text-meta">Focus stops</div>
            <div className="text-lg font-bold">{report.focusStops.length}</div>
          </div>
          <div className="rounded-xl border border-[var(--border-color)] p-3">
            <div className="text-xs text-meta">Missing labels</div>
            <div className="text-lg font-bold">{report.missingLabelCount}</div>
          </div>
          <div className="rounded-xl border border-[var(--border-color)] p-3">
            <div className="text-xs text-meta">Heading hierarchy</div>
            <div className="text-lg font-bold">
              {report.headingHierarchyValid ? 'Valid' : 'Skipped level'}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border-color)] p-3">
            <div className="text-xs text-meta">Contrast AA tokens</div>
            <div className="text-lg font-bold">
              {report.contrastSamples.filter((c) => c.passesAA).length}/
              {report.contrastSamples.length} pass
            </div>
          </div>
        </div>

        {diagnosticsEnabled && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
            {/* Focus Order & Label Audit Table */}
            <div className="rounded-xl border border-[var(--border-color)] p-3 overflow-x-auto">
              <table className="w-full text-xs">
                <caption className="text-left font-semibold mb-2">
                  Focus traversal order &amp; accessible label audit
                </caption>
                <thead>
                  <tr className="border-b border-[var(--border-color)] text-left">
                    <th scope="col" className="py-1.5 pr-2">#</th>
                    <th scope="col" className="py-1.5 pr-2">Element</th>
                    <th scope="col" className="py-1.5 pr-2">Accessible Name</th>
                    <th scope="col" className="py-1.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.focusStops.slice(0, 12).map((stop) => (
                    <tr key={stop.order} className="border-b border-[var(--border-color)]">
                      <th scope="row" className="py-1.5 pr-2 font-mono text-left">
                        {stop.order}
                      </th>
                      <td className="py-1.5 pr-2 font-mono">{stop.tag}</td>
                      <td className="py-1.5 pr-2 truncate max-w-[180px]">
                        {stop.accessibleName}
                      </td>
                      <td className="py-1.5">
                        {stop.hasVisibleLabel ? '✓ Labelled' : '✕ Missing label'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Contrast Sampling & Landmark Map */}
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--border-color)] p-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <caption className="text-left font-semibold mb-2">
                    WCAG 2.2 contrast token sampling
                  </caption>
                  <thead>
                    <tr className="border-b border-[var(--border-color)] text-left">
                      <th scope="col" className="py-1.5 pr-2">Token pair</th>
                      <th scope="col" className="py-1.5 pr-2 text-right">Ratio</th>
                      <th scope="col" className="py-1.5">Conformance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.contrastSamples.map((sample) => (
                      <tr
                        key={sample.pairName}
                        className="border-b border-[var(--border-color)]"
                      >
                        <th scope="row" className="py-1.5 pr-2 font-medium text-left">
                          {sample.pairName}
                        </th>
                        <td className="py-1.5 pr-2 text-right font-mono">
                          {sample.ratio}:1
                        </td>
                        <td className="py-1.5">
                          {sample.passesAAA
                            ? '✓ AAA (7:1+)'
                            : sample.passesAA
                              ? '✓ AA (4.5:1+)'
                              : '✕ Below AA'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-xl border border-[var(--border-color)] p-3">
                <h3 className="text-xs font-semibold mb-2">
                  Landmark &amp; heading outline ({report.landmarksAndHeadings.length} nodes)
                </h3>
                <ul className="space-y-1 text-xs max-h-40 overflow-y-auto">
                  {report.landmarksAndHeadings.slice(0, 12).map((item, idx) => (
                    <li key={`${item.tag}-${idx}`} className="flex items-center gap-2">
                      <span className="font-mono uppercase text-[11px] px-1.5 py-0.5 rounded bg-[var(--hover-bg)]">
                        {item.tag}
                      </span>
                      <span className="truncate">{item.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Privacy-Safe Accessibility Barrier Reporting Channel */}
      <section aria-labelledby="a11y-report-barrier-heading" className="card card-padding">
        <h2 id="a11y-report-barrier-heading" className="heading-section mb-1">
          Report an accessibility barrier
        </h2>
        <p className="text-meta mb-4">
          Submit feedback when a visualization, control, or workflow creates an accessibility barrier. Personal identifiers and tokens are automatically redacted before storage.
        </p>

        {submittedId && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 rounded-xl border border-[var(--border-color)] bg-[var(--hover-bg)] px-4 py-3 text-xs"
          >
            ✓ Barrier report <strong>{submittedId}</strong> recorded with privacy-redacted context.
          </div>
        )}

        <form onSubmit={handleReportSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-xs font-medium space-y-1">
              <span>Route or page path</span>
              <input
                type="text"
                value={routeInput}
                onChange={(e) => setRouteInput(e.target.value)}
                className="form-input w-full"
                required
              />
            </label>
            <label className="block text-xs font-medium space-y-1">
              <span>Component or surface</span>
              <input
                type="text"
                value={componentInput}
                onChange={(e) => setComponentInput(e.target.value)}
                className="form-input w-full"
                required
              />
            </label>
          </div>

          <label className="block text-xs font-medium space-y-1">
            <span>Describe the accessibility barrier encountered</span>
            <textarea
              rows={3}
              value={descriptionInput}
              onChange={(e) => setDescriptionInput(e.target.value)}
              placeholder="e.g., Keyboard focus gets trapped inside the trace filter popover when zoomed to 150%..."
              className="form-input w-full"
              required
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={includeDomSnapshot}
                onChange={(e) => setIncludeDomSnapshot(e.target.checked)}
              />
              <span>Attach privacy-safe DOM diagnostics summary (no raw user content)</span>
            </label>

            <button type="submit" className="btn-primary text-xs px-4 py-2">
              Submit barrier report
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
export default DiagnosticsPanel;
