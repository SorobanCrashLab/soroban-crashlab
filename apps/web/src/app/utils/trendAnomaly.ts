/**
 * Robust statistical anomaly detection for daily crash-rate series.
 *
 * Design notes (deliberately simple, explainable statistics — no ML):
 *
 * 1. Baseline is the MEDIAN of a trailing rolling window, and spread is the
 *    MAD (Median Absolute Deviation) of that same window. Both are robust:
 *    their breakdown point is 50%, meaning up to half the training window can
 *    be garbage before the estimate is dragged around. Mean/stddev have a
 *    breakdown point of 0% — a single 100-crash outlier inflates stddev enough
 *    to hide every subsequent real spike (see the worked example below).
 *
 * 2. MAD is rescaled by 1.4826 so that, for normally distributed data, it
 *    estimates the same quantity as the standard deviation. That keeps the
 *    resulting score readable as a "z-like" number by anyone used to sigmas.
 *
 * 3. The window is TRAILING and EXCLUSIVE: the point under test never
 *    contributes to its own baseline, so a spike cannot mask itself.
 *
 * 4. Missing calendar days are not synthesised. The window counts OBSERVED
 *    days, not calendar days — see `ANOMALY_WINDOW_DAYS` for the rationale.
 *
 * Worked example — why MAD and not stddev:
 *   Training window: thirteen quiet days of 5 crashes plus one bad deploy day
 *   of 100 crashes. Next day reports 40 crashes.
 *     - mean ≈ 11.8, stddev ≈ 25.4  → z ≈ (40 − 11.8) / 25.4 ≈ 1.1  → MISSED
 *     - median = 5, MAD = 0 → floored spread = 1 → score = 35        → FLAGGED
 *   The single contaminated day destroyed the stddev detector's sensitivity.
 *   The median/MAD detector never noticed it.
 */

import { CrashTrendPoint } from "../types";

/**
 * Rolling baseline window, in OBSERVED days.
 *
 * Justification for 14 (pinned by test):
 *   - It spans exactly two weeks, so weekday/weekend duty-cycle effects appear
 *     the same number of times in every window and cannot bias the median.
 *   - It is large enough for the median and MAD to be stable: with n = 14 the
 *     median is the average of the 7th and 8th order statistics, so up to 6
 *     contaminated days still cannot move it outside the quiet cluster.
 *   - It is small enough to track genuine regime changes within a sprint; a
 *     30-day window would keep flagging a fortnight after a level shift became
 *     the new normal.
 *   - Cold start stays acceptable: two weeks of history, not two months,
 *     before the first verdict is offered.
 */
export const ANOMALY_WINDOW_DAYS = 14;

/**
 * Consistency constant making a rescaled MAD comparable to a standard
 * deviation for normally distributed data (1 / Φ⁻¹(0.75) ≈ 1.4826).
 */
export const MAD_TO_SIGMA = 1.4826;

/**
 * Floor applied to the robust spread, in crashes/day.
 *
 * A window of identical values has MAD = 0, which would make the score
 * undefined (division by zero). Crash counts are integers, so a spread below
 * one crash per day is not physically resolvable: we floor it at 1. This keeps
 * two desirable behaviours simultaneously:
 *   - a perfectly flat series produces score 0 everywhere → no flags;
 *   - a flat-at-zero series followed by a 50-crash day is still caught.
 */
export const MIN_ROBUST_DEVIATION = 1;

/** Per-view sensitivity presets. */
export type AnomalySensitivity = "low" | "medium" | "high";

/**
 * Preset → k mapping (documented for reviewers).
 *
 *   low    k = 4.0  — only egregious outliers; quietest, fewest false alarms.
 *   medium k = 3.5  — default; the classic Iglewicz–Hoaglin modified z cutoff.
 *   high   k = 3.0  — catches smaller excursions, expect more noise.
 *
 * Higher sensitivity means a LOWER k, because k is the number of robust
 * deviations a point must clear before it is called anomalous.
 */
export const SENSITIVITY_K: Record<AnomalySensitivity, number> = {
  low: 4,
  medium: 3.5,
  high: 3,
};

/** Ordered list of presets, for rendering switchers. */
export const SENSITIVITY_PRESETS: AnomalySensitivity[] = [
  "low",
  "medium",
  "high",
];

/** One observed day of the series. */
export interface AnomalySeriesPoint {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** Crash count for that day. */
  value: number;
}

/** Which side of the baseline the point fell on. */
export type AnomalyDirection = "spike" | "drop";

/** A single flagged point. */
export interface AnomalyFlag {
  /** Index into the input series. */
  index: number;
  /** ISO date of the flagged point. */
  date: string;
  /** Observed value at that point. */
  value: number;
  /** Rolling median of the trailing window. */
  baseline: number;
  /** Rescaled MAD of the trailing window (after flooring). */
  deviation: number;
  /** Value the point had to clear to be flagged. */
  threshold: number;
  /** Signed z-like score: (value − baseline) / deviation. */
  score: number;
  /** Whether the point sat above or below the baseline. */
  direction: AnomalyDirection;
  /** Number of observed days used to build the baseline. */
  windowSize: number;
  /** k multiplier in force when this point was evaluated. */
  k: number;
}

/** Cold-start reporting: honesty instead of fake confidence. */
export interface ColdStartState {
  /** True while there is not yet a full window of history. */
  active: boolean;
  /** Observed days currently in the series. */
  observedDays: number;
  /** Observed days needed before the first point can be evaluated. */
  requiredDays: number;
  /** How many more observed days are needed (0 once satisfied). */
  moreDaysNeeded: number;
  /** Plain-language status line for the UI. */
  message: string;
}

/** Full detector output. */
export interface AnomalyDetectionResult {
  /** Flagged points, in series order. */
  flags: AnomalyFlag[];
  /** How many points were actually evaluated (excludes cold-start prefix). */
  evaluatedCount: number;
  /** Index of the first evaluated point, or -1 if none were evaluated. */
  firstEvaluatedIndex: number;
  /** Cold-start state for UI messaging. */
  coldStart: ColdStartState;
  /** Window size used. */
  window: number;
  /** k multiplier used. */
  k: number;
  /** Sensitivity preset used. */
  sensitivity: AnomalySensitivity;
}

/** Options for {@link detectAnomalies}. */
export interface DetectAnomaliesOptions {
  /** Sensitivity preset (default: 'medium'). */
  sensitivity?: AnomalySensitivity;
  /** Override the rolling window, in observed days (default: 14). */
  window?: number;
}

/** Round to 2 decimals so scores stay readable and comparisons stay stable. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Median of a numeric list. Does not mutate the input.
 * Returns 0 for an empty list (callers never rely on that path).
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Median Absolute Deviation: median(|xᵢ − median(x)|).
 * Raw (unscaled) — multiply by {@link MAD_TO_SIGMA} for a sigma-comparable value.
 */
export function medianAbsoluteDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const med = median(values);
  return median(values.map((v) => Math.abs(v - med)));
}

/**
 * Robust spread used by the detector: rescaled MAD, floored at
 * {@link MIN_ROBUST_DEVIATION} so degenerate windows stay usable.
 */
export function robustDeviation(values: number[]): number {
  const scaled = medianAbsoluteDeviation(values) * MAD_TO_SIGMA;
  return Math.max(scaled, MIN_ROBUST_DEVIATION);
}

/**
 * Detect anomalies in a daily crash-rate series.
 *
 * Pure: no I/O, no clock, no randomness — same input always yields the same
 * output. Complexity is O(n · w log w), which for a 365-day series with a
 * 14-day window is a few tens of thousands of comparisons (sub-millisecond).
 *
 * Points before a full window of history exist are NOT evaluated; they are
 * reported through `coldStart` instead of being guessed at.
 *
 * @param series - Observed days, ascending by date. Missing calendar days are
 *   simply absent: the window spans the previous N OBSERVED days, so a gap
 *   shortens the calendar reach of the baseline but never fabricates zeros.
 * @param options - Sensitivity preset and/or window override.
 */
export function detectAnomalies(
  series: AnomalySeriesPoint[],
  options: DetectAnomaliesOptions = {},
): AnomalyDetectionResult {
  const sensitivity: AnomalySensitivity = options.sensitivity ?? "medium";
  const k = SENSITIVITY_K[sensitivity];
  const windowSize =
    options.window && options.window > 0
      ? Math.floor(options.window)
      : ANOMALY_WINDOW_DAYS;

  const observedDays = series.length;
  const evaluatedCount = Math.max(0, observedDays - windowSize);
  const moreDaysNeeded = Math.max(0, windowSize - observedDays);

  const coldStart: ColdStartState = {
    active: evaluatedCount === 0,
    observedDays,
    requiredDays: windowSize,
    moreDaysNeeded,
    message: buildColdStartMessage(observedDays, windowSize),
  };

  const flags: AnomalyFlag[] = [];
  // Values array reused across iterations to avoid re-mapping the whole series.
  const values = series.map((p) => p.value);

  for (let i = windowSize; i < series.length; i += 1) {
    const window = values.slice(i - windowSize, i);
    const baseline = median(window);
    const deviation = robustDeviation(window);
    const value = values[i];
    const score = (value - baseline) / deviation;

    if (Math.abs(score) < k) {
      continue;
    }

    const direction: AnomalyDirection = score > 0 ? "spike" : "drop";
    const threshold =
      direction === "spike"
        ? baseline + k * deviation
        : baseline - k * deviation;

    flags.push({
      index: i,
      date: series[i].date,
      value,
      baseline: round2(baseline),
      deviation: round2(deviation),
      threshold: round2(threshold),
      score: round2(score),
      direction,
      windowSize,
      k,
    });
  }

  return {
    flags,
    evaluatedCount,
    firstEvaluatedIndex: evaluatedCount > 0 ? windowSize : -1,
    coldStart,
    window: windowSize,
    k,
    sensitivity,
  };
}

/** Cold-start copy: state what is missing rather than implying confidence. */
function buildColdStartMessage(
  observedDays: number,
  windowSize: number,
): string {
  const remaining = Math.max(0, windowSize - observedDays);
  if (remaining === 0) {
    return `Baseline ready: using the trailing ${windowSize} observed days.`;
  }
  const dayWord = remaining === 1 ? "day" : "days";
  return `Collecting baseline (${remaining} more ${dayWord}) — ${observedDays} of ${windowSize} observed days recorded. No anomalies are evaluated until the window is full.`;
}

/**
 * Build a plain-language explanation of a flag, generated from its numbers.
 * Used verbatim by the chart hover card.
 */
export function explainAnomaly(flag: AnomalyFlag): string {
  const label = formatDateLabel(flag.date);
  const crashWord = flag.value === 1 ? "crash" : "crashes";
  const directionWord = flag.direction === "spike" ? "above" : "below";
  const magnitude = Math.abs(flag.score).toFixed(1);
  const comparator = flag.direction === "spike" ? "above" : "below";

  return (
    `${label} recorded ${flag.value} ${crashWord}, against a ${flag.windowSize}-day baseline of ` +
    `${flag.baseline} (typical day-to-day spread ±${flag.deviation}). ` +
    `That is ${magnitude} robust deviations ${directionWord} the baseline, past the ` +
    `${flag.k}× threshold of ${flag.threshold} ${comparator} which a day counts as unusual.`
  );
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Format YYYY-MM-DD as e.g. "12 Aug 2026".
 * Parsed by string, never through `Date`, so the label cannot shift by a day
 * in negative-offset timezones.
 */
export function formatDateLabel(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const [, year, month, day] = match;
  const monthLabel = MONTH_LABELS[Number(month) - 1] ?? month;
  return `${Number(day)} ${monthLabel} ${year}`;
}

/**
 * Collapse chart data into a single daily crash-rate series by summing the
 * counts of the selected signatures for each day.
 *
 * Days present in `chartData` are kept in ascending date order; days with no
 * data at all are absent from the input and are therefore skipped rather than
 * imputed as zero (imputing zeros would invent quiet days and depress the
 * baseline).
 *
 * @param chartData - Chart points, one per observed day.
 * @param signatures - Signatures to include; empty means every signature.
 */
export function buildDailyRateSeries(
  chartData: CrashTrendPoint[],
  signatures: string[] = [],
): AnomalySeriesPoint[] {
  const include = new Set(signatures);
  const series = chartData.map((point) => {
    let total = 0;
    for (const [key, raw] of Object.entries(point)) {
      if (key === "date") continue;
      if (include.size > 0 && !include.has(key)) continue;
      if (typeof raw === "number" && Number.isFinite(raw)) {
        total += raw;
      }
    }
    return { date: String(point.date), value: total };
  });

  return series.sort((a, b) => a.date.localeCompare(b.date));
}

/** Index flags by date for O(1) lookup from chart render paths. */
export function indexFlagsByDate(
  flags: AnomalyFlag[],
): Map<string, AnomalyFlag> {
  const byDate = new Map<string, AnomalyFlag>();
  for (const flag of flags) {
    byDate.set(flag.date, flag);
  }
  return byDate;
}
