'use client';

/**
 * AssistiveModesProvider — provides per-surface assistive mode state and
 * reusable accessible alternative components (data table alternative for charts,
 * natural-language summary descriptions, pattern/shape encoding markers, and
 * simplified dense view layouts) (#2317).
 */

import React, { createContext, useContext, useMemo } from 'react';
import {
  DEFAULT_ASSISTIVE_MODE_PREFS,
  type AssistiveModePrefs,
} from '@/lib/accessibility-prefs';

export interface AssistiveChartDatum {
  label: string;
  value: number;
  unit?: string;
  category?: string;
}

export interface AssistiveModesContextValue {
  modes: AssistiveModePrefs;
  onToggleMode?: (key: keyof AssistiveModePrefs, next: boolean) => void;
}

const AssistiveModesContext = createContext<AssistiveModesContextValue>({
  modes: DEFAULT_ASSISTIVE_MODE_PREFS,
});

export function useAssistiveModes(): AssistiveModesContextValue {
  return useContext(AssistiveModesContext);
}

export interface AssistiveModesProviderProps {
  modes: AssistiveModePrefs;
  onToggleMode?: (key: keyof AssistiveModePrefs, next: boolean) => void;
  children: React.ReactNode;
}

export function AssistiveModesProvider({
  modes,
  onToggleMode,
  children,
}: AssistiveModesProviderProps) {
  const value = useMemo(
    () => ({
      modes,
      onToggleMode,
    }),
    [modes, onToggleMode],
  );

  return (
    <AssistiveModesContext.Provider value={value}>
      {children}
    </AssistiveModesContext.Provider>
  );
}

/**
 * Deterministic natural-language summary generator for chart series.
 * Ensures screen reader users receive an immediate executive summary of trends,
 * extrema, and totals without parsing raw SVG paths.
 */
export function buildAssistiveChartSummary(
  title: string,
  series: readonly AssistiveChartDatum[],
): string {
  if (series.length === 0) {
    return `${title}: No data points recorded.`;
  }
  let min = series[0];
  let max = series[0];
  let total = 0;

  for (const pt of series) {
    total += pt.value;
    if (pt.value < min.value) min = pt;
    if (pt.value > max.value) max = pt;
  }

  const unitSuffix = series[0].unit ? ` ${series[0].unit}` : '';
  const avg = (total / series.length).toFixed(1);
  return `${title} (${series.length} points): peak at ${max.label} (${max.value}${unitSuffix}), lowest at ${min.label} (${min.value}${unitSuffix}), mean ${avg}${unitSuffix}.`;
}

const PATTERN_MARKERS = ['● Solid', '▲ Hatched', '■ Dotted', '◆ Crosshatch'] as const;

export function getPatternShapeLabel(index: number): string {
  return PATTERN_MARKERS[Math.abs(index) % PATTERN_MARKERS.length];
}

export interface AssistiveVisualizationPreviewProps {
  title: string;
  series: readonly AssistiveChartDatum[];
}

/**
 * Live assistive visualization preview demonstrating:
 * - Auto-generated text summary descriptions
 * - Pattern/shape encoding markers alongside colour bars
 * - Accessible data-table alternative with `<caption />` and `<th scope>`
 */
export function AssistiveVisualizationPreview({
  title,
  series,
}: AssistiveVisualizationPreviewProps) {
  const { modes } = useAssistiveModes();
  const summaryText = useMemo(
    () => buildAssistiveChartSummary(title, series),
    [series, title],
  );
  const maxVal = useMemo(
    () => Math.max(1, ...series.map((s) => s.value)),
    [series],
  );

  return (
    <div
      className="rounded-xl border border-[var(--border-color)] p-4 space-y-4"
      data-testid="assistive-visualization-preview"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-meta">
          {modes.chartDataTableAlternative ? 'Table alternative active' : 'Visual + assistive mode'}
        </span>
      </div>

      {modes.autoSummaryDescriptions && (
        <p
          className="text-xs rounded-lg bg-[var(--hover-bg)] p-3 border border-[var(--border-color)]"
          role="note"
          aria-label="Assistive summary description"
        >
          <strong>Summary:</strong> {summaryText}
        </p>
      )}

      {!modes.chartDataTableAlternative && (
        <div
          className="space-y-2"
          role="img"
          aria-label={summaryText}
        >
          {series.map((item, idx) => {
            const widthPct = Math.round((item.value / maxVal) * 100);
            const patternLabel = getPatternShapeLabel(idx);
            return (
              <div key={item.label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium">
                    {modes.patternShapeEncoding ? `${patternLabel} · ` : ''}
                    {item.label}
                  </span>
                  <span className="font-mono">
                    {item.value}
                    {item.unit ? ` ${item.unit}` : ''}
                  </span>
                </div>
                <div className="h-2.5 w-full rounded bg-[var(--hover-bg)] overflow-hidden border border-[var(--border-color)]">
                  <div
                    className="h-full rounded bg-[#0A66C2]"
                    style={{
                      width: `${widthPct}%`,
                      backgroundImage: modes.patternShapeEncoding
                        ? 'repeating-linear-gradient(45deg, rgba(255,255,255,0.28) 0, rgba(255,255,255,0.28) 4px, transparent 4px, transparent 8px)'
                        : undefined,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modes.chartDataTableAlternative && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <caption className="text-left font-medium mb-2 text-meta">
              {title} — Structured Data Table Alternative
            </caption>
            <thead>
              <tr className="border-b border-[var(--border-color)] text-left">
                <th scope="col" className="py-2 pr-3">Segment</th>
                {modes.patternShapeEncoding && (
                  <th scope="col" className="py-2 pr-3">Pattern Marker</th>
                )}
                <th scope="col" className="py-2 pr-3 text-right">Value</th>
                <th scope="col" className="py-2 text-left">Category</th>
              </tr>
            </thead>
            <tbody>
              {series.map((item, idx) => (
                <tr key={item.label} className="border-b border-[var(--border-color)]">
                  <th scope="row" className="py-2 pr-3 font-medium text-left">
                    {item.label}
                  </th>
                  {modes.patternShapeEncoding && (
                    <td className="py-2 pr-3 font-mono">{getPatternShapeLabel(idx)}</td>
                  )}
                  <td className="py-2 pr-3 text-right font-mono">
                    {item.value}
                    {item.unit ? ` ${item.unit}` : ''}
                  </td>
                  <td className="py-2">{item.category ?? 'Core metric'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
