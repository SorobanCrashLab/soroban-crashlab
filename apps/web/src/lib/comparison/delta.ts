/**
 * lib/comparison/delta — set-and-metric diff for two fuzzing runs (#1877).
 *
 * The comparison page answers three questions, and each gets its own bucket:
 *
 *   added    — the candidate found a signature the baseline never did
 *   removed  — the baseline's signature no longer appears (fixed or masked)
 *   changed  — both runs saw it, but the frequency moved
 *
 * Everything here is pure and deterministic: identical inputs produce identical
 * ordering, which is what makes the view testable and what makes a "no changes"
 * verdict trustworthy. The bound (`MAX_COMPARISON_SIGNATURES`) is enforced by
 * the model rather than the page, so every caller gets the same explicit
 * `ComparisonTooLargeError` with the same narrowing guidance.
 */

/** Above this many distinct signatures the UI asks the user to narrow first. */
export const MAX_COMPARISON_SIGNATURES = 200;

export interface SignatureSample {
  /** Stable signature string; the identity used to pair the two sides. */
  signature: string;
  /** How often the signature occurred in this run. */
  count: number;
  failureClass?: string;
  contract?: string;
  severity?: string;
}

export interface ComparisonMetrics {
  seeds: number;
  failures: number;
  durationMs: number;
  coveragePercent?: number;
}

export interface ComparisonRow {
  signature: string;
  baseCount: number;
  candidateCount: number;
  /** candidate − base. Positive means the candidate saw it more often. */
  delta: number;
  failureClass?: string;
  contract?: string;
  severity?: string;
}

export interface MetricDelta {
  key: keyof ComparisonMetrics;
  label: string;
  unit?: string;
  base: number;
  candidate: number;
  delta: number;
  direction: 'up' | 'down' | 'flat';
  /** When false, a positive delta is a regression. */
  higherIsBetter: boolean;
}

export interface ComparisonDelta {
  added: ComparisonRow[];
  removed: ComparisonRow[];
  changed: ComparisonRow[];
  unchanged: ComparisonRow[];
  metrics: MetricDelta[];
  totals: {
    baseSignatures: number;
    candidateSignatures: number;
    added: number;
    removed: number;
    changed: number;
    unchanged: number;
  };
}

export interface ComparisonSide {
  runId: string;
  label: string;
  signatures: SignatureSample[];
  metrics: ComparisonMetrics;
}

export interface ComparisonResult {
  base: ComparisonSide;
  candidate: ComparisonSide;
  delta: ComparisonDelta;
}

export class ComparisonTooLargeError extends Error {
  readonly signatureCount: number;
  readonly limit: number;
  readonly guidance: string;

  constructor(signatureCount: number, limit: number) {
    super(
      `This comparison spans ${signatureCount} distinct signatures, above the ${limit}-signature limit. ` +
        'Narrow it with a failure-class or contract filter, or compare a single cluster.',
    );
    this.name = 'ComparisonTooLargeError';
    this.signatureCount = signatureCount;
    this.limit = limit;
    this.guidance =
      'Narrow the comparison with a failure-class or contract filter, or compare one cluster at a time.';
  }
}

const METRIC_COPY: Record<
  keyof ComparisonMetrics,
  { label: string; unit?: string; higherIsBetter: boolean }
> = {
  seeds: { label: 'Seeds executed', higherIsBetter: true },
  failures: { label: 'Distinct crashes', higherIsBetter: false },
  durationMs: { label: 'Duration', unit: 'ms', higherIsBetter: false },
  coveragePercent: { label: 'Coverage', unit: '%', higherIsBetter: true },
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Deduplicates by signature and sums counts. A signature appearing twice in an
 * input (two clusters that collapsed to the same hash) is one row, not two.
 * Invalid counts become 0 rather than `NaN`, which would poison every delta.
 */
export function normaliseSignatures(samples: readonly SignatureSample[]): SignatureSample[] {
  const bySignature = new Map<string, SignatureSample>();

  for (const sample of samples) {
    if (!sample || typeof sample.signature !== 'string') continue;
    const signature = sample.signature.trim();
    if (!signature) continue;

    const count = isFiniteNumber(sample.count) ? Math.max(0, Math.trunc(sample.count)) : 0;
    // A zero-count sample is "not observed"; keeping it would create a phantom
    // unchanged row and inflate the distinct-signature count.
    if (count <= 0) continue;
    const existing = bySignature.get(signature);

    if (existing) {
      existing.count += count;
      existing.failureClass ??= sample.failureClass;
      existing.contract ??= sample.contract;
      existing.severity ??= sample.severity;
      continue;
    }

    bySignature.set(signature, {
      signature,
      count,
      ...(sample.failureClass !== undefined ? { failureClass: sample.failureClass } : {}),
      ...(sample.contract !== undefined ? { contract: sample.contract } : {}),
      ...(sample.severity !== undefined ? { severity: sample.severity } : {}),
    });
  }

  return [...bySignature.values()];
}

/** Volume first, then signature — a total order, so output is reproducible. */
function compareRows(a: ComparisonRow, b: ComparisonRow): number {
  const byVolume = Math.abs(b.delta) - Math.abs(a.delta);
  if (byVolume !== 0) return byVolume;
  return a.signature < b.signature ? -1 : a.signature > b.signature ? 1 : 0;
}

/**
 * Builds the three-bucket diff. `options.limit` exists for tests and for a
 * future "compare a narrowed slice" flow; callers should not raise it.
 */
export function buildComparisonDelta(
  baseSamples: readonly SignatureSample[],
  candidateSamples: readonly SignatureSample[],
  options: { limit?: number } = {},
): ComparisonDelta {
  const limit = options.limit ?? MAX_COMPARISON_SIGNATURES;
  const base = normaliseSignatures(baseSamples);
  const candidate = normaliseSignatures(candidateSamples);

  const baseBySignature = new Map(base.map((sample) => [sample.signature, sample]));
  const candidateBySignature = new Map(candidate.map((sample) => [sample.signature, sample]));
  const signatures = new Set<string>([...baseBySignature.keys(), ...candidateBySignature.keys()]);

  if (signatures.size > limit) {
    throw new ComparisonTooLargeError(signatures.size, limit);
  }

  const added: ComparisonRow[] = [];
  const removed: ComparisonRow[] = [];
  const changed: ComparisonRow[] = [];
  const unchanged: ComparisonRow[] = [];

  for (const signature of signatures) {
    const baseSample = baseBySignature.get(signature);
    const candidateSample = candidateBySignature.get(signature);
    const baseCount = baseSample?.count ?? 0;
    const candidateCount = candidateSample?.count ?? 0;

    const row: ComparisonRow = {
      signature,
      baseCount,
      candidateCount,
      delta: candidateCount - baseCount,
    };
    // Metadata can live on either side; prefer the candidate's copy when both
    // have it, but keep the base's when the candidate row lost it.
    const failureClass = candidateSample?.failureClass ?? baseSample?.failureClass;
    const contract = candidateSample?.contract ?? baseSample?.contract;
    const severity = candidateSample?.severity ?? baseSample?.severity;
    if (failureClass !== undefined) row.failureClass = failureClass;
    if (contract !== undefined) row.contract = contract;
    if (severity !== undefined) row.severity = severity;

    if (baseCount === 0 && candidateCount > 0) added.push(row);
    else if (baseCount > 0 && candidateCount === 0) removed.push(row);
    else if (row.delta !== 0) changed.push(row);
    else unchanged.push(row);
  }

  added.sort(compareRows);
  removed.sort(compareRows);
  changed.sort(compareRows);
  unchanged.sort(compareRows);

  return {
    added,
    removed,
    changed,
    unchanged,
    metrics: buildMetricDeltas(base, candidate),
    totals: {
      baseSignatures: base.filter((sample) => sample.count > 0).length,
      candidateSignatures: candidate.filter((sample) => sample.count > 0).length,
      added: added.length,
      removed: removed.length,
      changed: changed.length,
      unchanged: unchanged.length,
    },
  };
}

function metricDelta(key: keyof ComparisonMetrics, base: number, candidate: number): MetricDelta {
  const copy = METRIC_COPY[key];
  const delta = candidate - base;
  return {
    key,
    label: copy.label,
    ...(copy.unit !== undefined ? { unit: copy.unit } : {}),
    base,
    candidate,
    delta,
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
    higherIsBetter: copy.higherIsBetter,
  };
}

/**
 * Metrics that only exist on one side are emitted as zero on the other side so
 * the table never has a hole. `coveragePercent` is skipped when neither run
 * reports it — an absent measurement is not a 0% measurement.
 */
export function buildMetricDeltas(
  baseSamples: readonly SignatureSample[],
  candidateSamples: readonly SignatureSample[],
): MetricDelta[] {
  const baseCount = baseSamples.reduce((sum, sample) => sum + sample.count, 0);
  const candidateCount = candidateSamples.reduce((sum, sample) => sum + sample.count, 0);

  return [
    metricDelta('seeds', baseCount, candidateCount),
    metricDelta('failures', baseSamples.length, candidateSamples.length),
  ];
}

/** Extends the numeric metric table with the runs' own metrics (B5). */
export function buildRunMetricDeltas(
  base: ComparisonMetrics,
  candidate: ComparisonMetrics,
): MetricDelta[] {
  const keys: Array<keyof ComparisonMetrics> = ['seeds', 'failures', 'durationMs'];
  if (base.coveragePercent !== undefined || candidate.coveragePercent !== undefined) {
    keys.push('coveragePercent');
  }

  return keys.map((key) =>
    metricDelta(key, base[key] ?? 0, candidate[key] ?? 0),
  );
}

/**
 * Compares two fully-formed sides. Throws `ComparisonTooLargeError` when the
 * union exceeds the bound; the API turns that into a 422 with guidance.
 */
export function compareSides(base: ComparisonSide, candidate: ComparisonSide): ComparisonResult {
  return {
    base,
    candidate,
    delta: buildComparisonDelta(base.signatures, candidate.signatures),
  };
}

/**
 * True when the two runs are indistinguishable in the model. The page uses it
 * to render the explicit "no changes" state rather than three empty panes.
 */
export function hasNoChanges(delta: ComparisonDelta): boolean {
  return (
    delta.added.length === 0 &&
    delta.removed.length === 0 &&
    delta.changed.length === 0 &&
    !delta.metrics.some((metric) => metric.delta !== 0)
  );
}
