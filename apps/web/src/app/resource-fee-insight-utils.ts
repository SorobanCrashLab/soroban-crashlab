/**
 * Resource fee insight aggregation (#1883).
 *
 * Fee/resource data is recorded per seed by W5-A12 (#1792). This module
 * normalises the versioned envelope, falls back to the flat metrics emitted by
 * pre-W5-A12 runs, and builds the bounded distributions, threshold crossings
 * and trends the campaign fee panel renders.
 *
 * Everything here is pure and server-safe: routes aggregate once and send a
 * pre-computed payload so the client never needs raw run rows.
 */

import type { FuzzingRun, RunStatus } from './types';
import {
  RESOURCE_THRESHOLDS,
  classifyResourceLevel,
  parseContractCall,
  type ResourceLevel,
  type ResourceThresholds,
} from './resource-fee-utils';

export type FeeMetric = 'cpu' | 'memory' | 'fee';
export type FeeDataSource = 'envelope' | 'legacy' | 'absent';

export const DEFAULT_HISTOGRAM_BUCKETS = 12;
export const DEFAULT_TOP_FIXTURES = 10;
export const MAX_HISTOGRAM_BUCKETS = 50;
export const MAX_TOP_FIXTURES = 50;
export const MAX_TREND_POINTS = 500;

type UnknownRecord = Record<string, unknown>;

const ROOT_ENVELOPE_CONTAINERS = [
  'fee',
  'feeEnvelope',
  'fee_envelope',
  'feeSimulation',
  'fee_simulation',
  'resourceUsage',
  'resource_usage',
  'resourceFee',
  'resource_fee',
  'outcome',
  'envelope',
  'simulation',
  'budgetSimulation',
  'budget_simulation',
] as const;

const A12_MARKER_KEYS = [
  'minBuiltinEntries',
  'min_builtin_entries',
  'inclusionFee',
  'inclusion_fee',
  'rentBumps',
  'rent_bumps',
  'feeWarnThreshold',
  'fee_warn_threshold',
  'expensiveSuccess',
  'expensive_success',
  'expensiveFailure',
  'expensive_failure',
] as const;

const CPU_KEYS = [
  'cpuInstructions',
  'cpu_instructions',
  'cpuInsns',
  'cpu_insns',
  'cpuUnits',
  'cpu_units',
  'cpu',
  'instructions',
] as const;

const MEMORY_KEYS = [
  'memoryBytes',
  'memory_bytes',
  'memBytes',
  'mem_bytes',
  'memory',
  'mem',
  'memoryUnits',
  'memory_units',
] as const;

const FEE_KEYS = [
  'minResourceFee',
  'min_resource_fee',
  'inclusionFee',
  'inclusion_fee',
  'resourceFee',
  'resource_fee',
  'totalFee',
  'total_fee',
  'fee',
] as const;

const FEE_WARN_KEYS = [
  'feeWarnThreshold',
  'fee_warn_threshold',
  'feeWarning',
  'fee_warning',
  'warnThreshold',
  'warn_threshold',
] as const;

const EXPENSIVE_SUCCESS_KEYS = ['expensiveSuccess', 'expensive_success'] as const;
const EXPENSIVE_FAILURE_KEYS = ['expensiveFailure', 'expensive_failure'] as const;

const CAMPAIGN_KEYS = ['campaignId', 'campaign_id'] as const;
const FIXTURE_KEYS = ['fixture', 'fixtureName', 'fixture_name'] as const;
const CONTRACT_KEYS = ['contract', 'contractId', 'contract_id'] as const;
const METHOD_KEYS = ['method', 'function'] as const;

function asRecord(value: unknown): UnknownRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as UnknownRecord;
}

function collectRecords(run: FuzzingRun): { records: UnknownRecord[]; hasEnvelope: boolean } {
  const root = asRecord(run);
  if (!root) return { records: [], hasEnvelope: false };

  // Envelope records win over the flat legacy mirror. A12 writers emit both so
  // pre-W5-A12 readers keep working, but the envelope is authoritative.
  const nestedRecords: UnknownRecord[] = [];
  let hasEnvelope = A12_MARKER_KEYS.some(
    (key) => root[key] !== undefined && root[key] !== null,
  );

  for (const key of ROOT_ENVELOPE_CONTAINERS) {
    const nested = asRecord(root[key]);
    if (!nested) continue;
    nestedRecords.push(nested);
    hasEnvelope = true;

    // `outcome` / `envelope` may wrap fee/resource objects one level deeper.
    for (const childKey of ['fee', 'resourceUsage', 'resource_usage']) {
      const child = asRecord(nested[childKey]);
      if (child) {
        nestedRecords.push(child);
        hasEnvelope = true;
      }
    }
  }

  // Association/health wrappers contribute campaign ids but do not by
  // themselves prove the run has a W5-A12 fee envelope.
  for (const key of ['campaign', 'health', 'healthSnapshot', 'health_snapshot']) {
    const nested = asRecord(root[key]);
    if (nested) nestedRecords.push(nested);
  }

  return { records: [...nestedRecords, root], hasEnvelope };
}

function readNumber(records: UnknownRecord[], keys: readonly string[]): number | null {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
    }
  }
  return null;
}

function readBoolean(records: UnknownRecord[], keys: readonly string[]): boolean | null {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'boolean') return value;
    }
  }
  return null;
}

function readString(records: UnknownRecord[], keys: readonly string[]): string | null {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim().length > 0) return value;
    }
  }
  return null;
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Normalised view of one run's resource/fee data.
 *
 * `null` means the metric was not recorded (or was malformed), which is how we
 * distinguish a genuine zero from the pre-W5-A12 fee-data-absent state.
 */
export interface RunFeeSample {
  runId: string;
  campaignId?: string;
  fixture: string;
  contract?: string;
  method?: string;
  status: RunStatus;
  source: FeeDataSource;
  hasFeeData: boolean;
  cpuInstructions: number | null;
  memoryBytes: number | null;
  minResourceFee: number | null;
  minBuiltinEntries: number | null;
  inclusionFee: number | null;
  rentBumps: number | null;
  feeWarnThreshold?: number;
  expensiveSuccess: boolean;
  expensiveFailure: boolean;
  timestamp: number | null;
}

export function extractRunFeeSample(
  run: FuzzingRun,
  thresholds: ResourceThresholds = RESOURCE_THRESHOLDS,
): RunFeeSample {
  const { records, hasEnvelope } = collectRecords(run);

  const cpuInstructions = readNumber(records, CPU_KEYS);
  const memoryBytes = readNumber(records, MEMORY_KEYS);
  const minResourceFee = readNumber(records, FEE_KEYS);
  const minBuiltinEntries = readNumber(records, ['minBuiltinEntries', 'min_builtin_entries', 'minBuiltin', 'min_builtin']);
  const inclusionFee = readNumber(records, ['inclusionFee', 'inclusion_fee']);
  const rentBumps = readNumber(records, ['rentBumps', 'rent_bumps']);
  const feeWarnThreshold = readNumber(records, FEE_WARN_KEYS) ?? undefined;

  const hasFlatMetrics =
    cpuInstructions !== null || memoryBytes !== null || minResourceFee !== null;
  const source: FeeDataSource = hasEnvelope
    ? 'envelope'
    : hasFlatMetrics
      ? 'legacy'
      : 'absent';

  const feeThreshold = feeWarnThreshold ?? thresholds.feeWarning;
  const overFeeThreshold = minResourceFee !== null && minResourceFee >= feeThreshold;
  const overCriticalResource =
    (cpuInstructions !== null && cpuInstructions >= thresholds.cpuCritical) ||
    (memoryBytes !== null && memoryBytes >= thresholds.memoryCritical);
  const overBudget = overFeeThreshold || overCriticalResource;

  const explicitSuccess = readBoolean(records, EXPENSIVE_SUCCESS_KEYS);
  const explicitFailure = readBoolean(records, EXPENSIVE_FAILURE_KEYS);

  const call = parseContractCall(run);
  const explicitFixture = readString(records, FIXTURE_KEYS);
  const contract = call?.contract ?? readString(records, CONTRACT_KEYS);
  const method = call?.method ?? readString(records, METHOD_KEYS);
  const fixture =
    explicitFixture ??
    (contract ? (method ? `${contract}::${method}` : contract) : undefined) ??
    run.crashDetail?.signature ??
    run.id;

  return {
    runId: run.id,
    campaignId: readString(records, CAMPAIGN_KEYS) ?? undefined,
    fixture,
    ...(contract ? { contract } : {}),
    ...(method ? { method } : {}),
    status: run.status,
    source,
    hasFeeData: hasFlatMetrics,
    cpuInstructions,
    memoryBytes,
    minResourceFee,
    minBuiltinEntries,
    inclusionFee,
    rentBumps,
    ...(feeWarnThreshold !== undefined ? { feeWarnThreshold } : {}),
    expensiveSuccess: explicitSuccess ?? (run.status === 'completed' && overBudget),
    expensiveFailure: explicitFailure ?? (run.status === 'failed' && overBudget),
    timestamp:
      parseTimestamp(run.finishedAt) ??
      parseTimestamp(run.startedAt) ??
      parseTimestamp(run.queuedAt) ??
      null,
  };
}

// ---------------------------------------------------------------------------
// Histograms
// ---------------------------------------------------------------------------

export interface HistogramBucket {
  index: number;
  start: number;
  end: number;
  count: number;
}

export interface HistogramThresholdMarker {
  level: 'warning' | 'critical';
  value: number;
  /** Percentage across the histogram, clamped to 0–100. */
  position: number;
  inRange: boolean;
}

export interface FeeHistogram {
  metric: FeeMetric;
  buckets: HistogramBucket[];
  min: number;
  max: number;
  total: number;
  warning: number;
  critical: number;
  warningMarker: HistogramThresholdMarker;
  criticalMarker: HistogramThresholdMarker;
}

export interface HistogramOptions {
  bucketCount?: number;
  warning?: number;
  critical?: number;
  min?: number;
  max?: number;
}

function clampBucketCount(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_HISTOGRAM_BUCKETS;
  return Math.max(1, Math.min(MAX_HISTOGRAM_BUCKETS, Math.floor(value)));
}

function markerPosition(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

/**
 * Builds a fixed-width histogram in `[min, max]`. Values above `max` land in
 * the last bucket; values below `min` land in the first. Buckets are half-open
 * except the final one, so `[0, 10, 20]` with two buckets counts `1, 2`.
 */
export function buildHistogram(
  values: readonly number[],
  metric: FeeMetric,
  options: HistogramOptions = {},
): FeeHistogram {
  const bucketCount = clampBucketCount(options.bucketCount);
  const clean = values.filter((value) => Number.isFinite(value) && value >= 0);
  const observedMax = maxOf(clean);
  const min = options.min ?? 0;
  const max = options.max ?? (observedMax > min ? observedMax : min + 1);
  const span = max > min ? max - min : 1;
  const width = span / bucketCount;

  const buckets: HistogramBucket[] = Array.from({ length: bucketCount }, (_, index) => ({
    index,
    start: min + width * index,
    end: index === bucketCount - 1 ? max : min + width * (index + 1),
    count: 0,
  }));

  for (const value of clean) {
    let index: number;
    if (value <= min) index = 0;
    else if (value >= max) index = bucketCount - 1;
    else index = Math.min(bucketCount - 1, Math.floor((value - min) / width));
    buckets[index].count += 1;
  }

  const warning = options.warning ?? 0;
  const critical = options.critical ?? 0;

  return {
    metric,
    buckets,
    min,
    max,
    total: clean.length,
    warning,
    critical,
    warningMarker: {
      level: 'warning',
      value: warning,
      position: markerPosition(warning, min, max),
      inRange: warning >= min && warning <= max,
    },
    criticalMarker: {
      level: 'critical',
      value: critical,
      position: markerPosition(critical, min, max),
      inRange: critical >= min && critical <= max,
    },
  };
}

export function buildResourceFeeHistograms(
  samples: readonly RunFeeSample[],
  thresholds: ResourceThresholds,
  bucketCount = DEFAULT_HISTOGRAM_BUCKETS,
): Record<FeeMetric, FeeHistogram> {
  const cpu = samples
    .map((sample) => sample.cpuInstructions)
    .filter((value): value is number => value !== null);
  const memory = samples
    .map((sample) => sample.memoryBytes)
    .filter((value): value is number => value !== null);
  const fee = samples
    .map((sample) => sample.minResourceFee)
    .filter((value): value is number => value !== null);

  return {
    cpu: buildHistogram(cpu, 'cpu', {
      bucketCount,
      warning: thresholds.cpuWarning,
      critical: thresholds.cpuCritical,
    }),
    memory: buildHistogram(memory, 'memory', {
      bucketCount,
      warning: thresholds.memoryWarning,
      critical: thresholds.memoryCritical,
    }),
    fee: buildHistogram(fee, 'fee', {
      bucketCount,
      warning: thresholds.feeWarning,
      critical: thresholds.feeCritical,
    }),
  };
}

// ---------------------------------------------------------------------------
// Threshold crossings
// ---------------------------------------------------------------------------

export interface MetricThresholdCrossing {
  metric: FeeMetric;
  warningThreshold: number;
  criticalThreshold: number;
  /** Values in the warning band (`>= warning`, `< critical`). */
  warningCount: number;
  /** Values at or above the critical threshold. */
  criticalCount: number;
  /** All values at or above the warning threshold. */
  crossingCount: number;
  total: number;
  crossingRatio: number;
}

export function countThresholdCrossings(
  values: readonly number[],
  metric: FeeMetric,
  warning: number,
  critical: number,
): MetricThresholdCrossing {
  let warningCount = 0;
  let criticalCount = 0;

  for (const value of values) {
    if (!Number.isFinite(value) || value < 0) continue;
    if (value >= critical) criticalCount += 1;
    else if (value >= warning) warningCount += 1;
  }

  const total = values.length;
  const crossingCount = warningCount + criticalCount;

  return {
    metric,
    warningThreshold: warning,
    criticalThreshold: critical,
    warningCount,
    criticalCount,
    crossingCount,
    total,
    crossingRatio: total > 0 ? crossingCount / total : 0,
  };
}

// ---------------------------------------------------------------------------
// Trend
// ---------------------------------------------------------------------------

export interface FeeTrendPoint {
  ts: number;
  bucketStart: string;
  runCount: number;
  totalFee: number;
  avgFee: number;
  maxFee: number;
  avgCpu: number;
  avgMemory: number;
  warningCount: number;
  criticalCount: number;
}

export interface FeeTrendResult {
  points: FeeTrendPoint[];
  downsampled: boolean;
  bucketMs: number;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function maxOf(values: readonly number[]): number {
  let max = 0;
  for (const value of values) {
    if (value > max) max = value;
  }
  return max;
}

function chooseTrendBucketMs(span: number): number {
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (span <= 2 * hour) return 5 * minute;
  if (span <= 2 * day) return hour;
  if (span <= 60 * day) return day;
  return 7 * day;
}

function downsampleTrend(points: FeeTrendPoint[], maxPoints: number): FeeTrendPoint[] {
  if (points.length <= maxPoints) return points;
  if (maxPoints < 2) return points.slice(0, Math.max(0, maxPoints));

  const bucketCount = Math.max(1, Math.floor(maxPoints / 2));
  const chunkSize = points.length / bucketCount;
  const result: FeeTrendPoint[] = [];

  for (let i = 0; i < bucketCount; i += 1) {
    const start = Math.floor(i * chunkSize);
    const end = i === bucketCount - 1 ? points.length : Math.floor((i + 1) * chunkSize);
    const chunk = points.slice(start, end);
    if (chunk.length === 0) continue;

    let minPoint = chunk[0];
    let maxPoint = chunk[0];
    for (const point of chunk) {
      if (point.avgFee < minPoint.avgFee) minPoint = point;
      if (point.avgFee > maxPoint.avgFee) maxPoint = point;
    }

    const pair = minPoint.ts === maxPoint.ts ? [minPoint] : [minPoint, maxPoint];
    pair.sort((a, b) => a.ts - b.ts);
    for (const point of pair) {
      if (result.length === 0 || result[result.length - 1].ts !== point.ts) {
        result.push(point);
      }
    }
  }

  return result;
}

export function buildFeeTrend(
  samples: readonly RunFeeSample[],
  options: { maxPoints?: number; bucketMs?: number; thresholds?: ResourceThresholds } = {},
): FeeTrendResult {
  const maxPoints = Math.max(
    2,
    Math.min(MAX_TREND_POINTS, Math.floor(options.maxPoints ?? MAX_TREND_POINTS)),
  );
  const thresholds = options.thresholds ?? RESOURCE_THRESHOLDS;

  const timestamped = samples
    .filter((sample) => sample.timestamp !== null && sample.minResourceFee !== null)
    .map((sample) => ({ sample, ts: sample.timestamp as number }))
    .sort((a, b) => a.ts - b.ts);

  if (timestamped.length === 0) {
    return { points: [], downsampled: false, bucketMs: options.bucketMs ?? 0 };
  }

  const span = timestamped[timestamped.length - 1].ts - timestamped[0].ts;
  const bucketMs = options.bucketMs && options.bucketMs > 0
    ? options.bucketMs
    : chooseTrendBucketMs(span);

  const buckets = new Map<number, RunFeeSample[]>();
  for (const { sample, ts } of timestamped) {
    const key = Math.floor(ts / bucketMs) * bucketMs;
    const bucket = buckets.get(key) ?? [];
    bucket.push(sample);
    buckets.set(key, bucket);
  }

  const points = Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([ts, bucketSamples]): FeeTrendPoint => {
      const fees = bucketSamples
        .map((sample) => sample.minResourceFee)
        .filter((value): value is number => value !== null);
      const cpus = bucketSamples
        .map((sample) => sample.cpuInstructions)
        .filter((value): value is number => value !== null);
      const memories = bucketSamples
        .map((sample) => sample.memoryBytes)
        .filter((value): value is number => value !== null);
      const crossings = countThresholdCrossings(
        fees,
        'fee',
        thresholds.feeWarning,
        thresholds.feeCritical,
      );

      return {
        ts,
        bucketStart: new Date(ts).toISOString(),
        runCount: bucketSamples.length,
        totalFee: fees.reduce((sum, value) => sum + value, 0),
        avgFee: average(fees),
        maxFee: maxOf(fees),
        avgCpu: average(cpus),
        avgMemory: average(memories),
        warningCount: crossings.warningCount,
        criticalCount: crossings.criticalCount,
      };
    });

  const downsampled = points.length > maxPoints;
  return {
    points: downsampled ? downsampleTrend(points, maxPoints) : points,
    downsampled,
    bucketMs,
  };
}

// ---------------------------------------------------------------------------
// Top expensive fixtures
// ---------------------------------------------------------------------------

export interface ExpensiveFixture {
  fixture: string;
  contract?: string;
  method?: string;
  runCount: number;
  totalFee: number;
  avgFee: number;
  maxFee: number;
  maxCpu: number;
  maxMemory: number;
  expensiveCount: number;
  representativeRunId: string;
  href: string;
  statuses: Partial<Record<RunStatus, number>>;
}

export function groupTopExpensiveFixtures(
  samples: readonly RunFeeSample[],
  limit = DEFAULT_TOP_FIXTURES,
): ExpensiveFixture[] {
  const topN = Math.max(1, Math.min(MAX_TOP_FIXTURES, Math.floor(limit)));
  const groups = new Map<string, RunFeeSample[]>();

  for (const sample of samples) {
    if (!sample.hasFeeData) continue;
    const bucket = groups.get(sample.fixture) ?? [];
    bucket.push(sample);
    groups.set(sample.fixture, bucket);
  }

  return Array.from(groups.entries())
    .map(([fixture, bucket]): ExpensiveFixture => {
      const fees = bucket
        .map((sample) => sample.minResourceFee)
        .filter((value): value is number => value !== null);
      const cpus = bucket
        .map((sample) => sample.cpuInstructions)
        .filter((value): value is number => value !== null);
      const memories = bucket
        .map((sample) => sample.memoryBytes)
        .filter((value): value is number => value !== null);

      const representative = bucket.reduce((best, sample) => {
        const bestFee = best.minResourceFee ?? -1;
        const sampleFee = sample.minResourceFee ?? -1;
        if (sampleFee > bestFee) return sample;
        if (sampleFee === bestFee && (sample.cpuInstructions ?? 0) > (best.cpuInstructions ?? 0)) {
          return sample;
        }
        return best;
      });

      const statuses: Partial<Record<RunStatus, number>> = {};
      let expensiveCount = 0;
      for (const sample of bucket) {
        statuses[sample.status] = (statuses[sample.status] ?? 0) + 1;
        if (sample.expensiveSuccess || sample.expensiveFailure) expensiveCount += 1;
      }

      const first = bucket[0];
      return {
        fixture,
        ...(first.contract ? { contract: first.contract } : {}),
        ...(first.method ? { method: first.method } : {}),
        runCount: bucket.length,
        totalFee: fees.reduce((sum, value) => sum + value, 0),
        avgFee: average(fees),
        maxFee: maxOf(fees),
        maxCpu: maxOf(cpus),
        maxMemory: maxOf(memories),
        expensiveCount,
        representativeRunId: representative.runId,
        href: `/runs/${encodeURIComponent(representative.runId)}`,
        statuses,
      };
    })
    .sort((a, b) => {
      if (b.maxFee !== a.maxFee) return b.maxFee - a.maxFee;
      if (b.maxCpu !== a.maxCpu) return b.maxCpu - a.maxCpu;
      return a.fixture.localeCompare(b.fixture);
    })
    .slice(0, topN);
}

// ---------------------------------------------------------------------------
// Campaign aggregate
// ---------------------------------------------------------------------------

export interface FeeDataCoverage {
  envelope: number;
  legacy: number;
  absent: number;
}

export interface CampaignFeeTotals {
  totalCpu: number;
  avgCpu: number;
  maxCpu: number;
  totalMemory: number;
  avgMemory: number;
  maxMemory: number;
  totalFee: number;
  avgFee: number;
  maxFee: number;
}

export interface CampaignFeeInsight {
  campaignId: string;
  runCount: number;
  runsWithFeeData: number;
  runsWithoutFeeData: number;
  coverage: FeeDataCoverage;
  hasFeeData: boolean;
  thresholds: ResourceThresholds;
  histograms: Record<FeeMetric, FeeHistogram>;
  thresholdCrossings: {
    cpu: MetricThresholdCrossing;
    memory: MetricThresholdCrossing;
    fee: MetricThresholdCrossing;
    total: number;
  };
  expensiveFixtures: ExpensiveFixture[];
  trend: FeeTrendPoint[];
  trendDownsampled: boolean;
  trendBucketMs: number;
  totals: CampaignFeeTotals;
  expensiveSuccessCount: number;
  expensiveFailureCount: number;
}

export interface FeeInsightOptions {
  topN?: number;
  bucketCount?: number;
  maxTrendPoints?: number;
  trendBucketMs?: number;
  thresholds?: Partial<ResourceThresholds>;
}

function mergeThresholds(overrides: Partial<ResourceThresholds> = {}): ResourceThresholds {
  const merged = { ...RESOURCE_THRESHOLDS };
  for (const key of Object.keys(merged) as Array<keyof ResourceThresholds>) {
    const value = overrides[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      merged[key] = value;
    }
  }
  return merged;
}

/**
 * A12 lets every run configure its own fee warning threshold. For a campaign
 * marker we use the most common configured value (ties resolve to the lowest)
 * unless the caller explicitly overrides it.
 */
export function resolveCampaignThresholds(
  samples: readonly RunFeeSample[],
  overrides: Partial<ResourceThresholds> = {},
): ResourceThresholds {
  const thresholds = mergeThresholds(overrides);
  if (overrides.feeWarning !== undefined) return thresholds;

  const counts = new Map<number, number>();
  for (const sample of samples) {
    if (sample.feeWarnThreshold === undefined) continue;
    counts.set(sample.feeWarnThreshold, (counts.get(sample.feeWarnThreshold) ?? 0) + 1);
  }
  if (counts.size === 0) return thresholds;

  let chosen = Number.POSITIVE_INFINITY;
  let bestCount = -1;
  for (const [value, count] of counts) {
    if (count > bestCount || (count === bestCount && value < chosen)) {
      chosen = value;
      bestCount = count;
    }
  }
  thresholds.feeWarning = chosen;
  return thresholds;
}

export function filterRunsForCampaign(
  runs: readonly FuzzingRun[],
  campaignId: string,
  thresholds?: ResourceThresholds,
): FuzzingRun[] {
  const scoped = runs.filter((run) => extractRunFeeSample(run, thresholds).campaignId !== undefined);
  if (scoped.length === 0) {
    // Pre-W5-A12 / pre-campaign-index data has no association field. Treat the
    // supplied rows as the campaign rather than rendering a false empty state.
    return [...runs];
  }
  return scoped.filter((run) => extractRunFeeSample(run, thresholds).campaignId === campaignId);
}

export function aggregateFeeSamples(
  campaignId: string,
  samples: readonly RunFeeSample[],
  options: FeeInsightOptions = {},
): CampaignFeeInsight {
  const thresholds = resolveCampaignThresholds(samples, options.thresholds);
  const bucketCount = clampBucketCount(options.bucketCount);
  const withData = samples.filter((sample) => sample.hasFeeData);
  const coverage: FeeDataCoverage = { envelope: 0, legacy: 0, absent: 0 };
  for (const sample of samples) coverage[sample.source] += 1;

  const cpus = withData
    .map((sample) => sample.cpuInstructions)
    .filter((value): value is number => value !== null);
  const memories = withData
    .map((sample) => sample.memoryBytes)
    .filter((value): value is number => value !== null);
  const fees = withData
    .map((sample) => sample.minResourceFee)
    .filter((value): value is number => value !== null);

  const cpuCrossing = countThresholdCrossings(
    cpus,
    'cpu',
    thresholds.cpuWarning,
    thresholds.cpuCritical,
  );
  const memoryCrossing = countThresholdCrossings(
    memories,
    'memory',
    thresholds.memoryWarning,
    thresholds.memoryCritical,
  );
  const feeCrossing = countThresholdCrossings(
    fees,
    'fee',
    thresholds.feeWarning,
    thresholds.feeCritical,
  );

  const trend = buildFeeTrend(withData, {
    maxPoints: options.maxTrendPoints,
    bucketMs: options.trendBucketMs,
    thresholds,
  });

  let expensiveSuccessCount = 0;
  let expensiveFailureCount = 0;
  for (const sample of samples) {
    if (sample.expensiveSuccess) expensiveSuccessCount += 1;
    if (sample.expensiveFailure) expensiveFailureCount += 1;
  }

  return {
    campaignId,
    runCount: samples.length,
    runsWithFeeData: withData.length,
    runsWithoutFeeData: samples.length - withData.length,
    coverage,
    hasFeeData: withData.length > 0,
    thresholds,
    histograms: buildResourceFeeHistograms(withData, thresholds, bucketCount),
    thresholdCrossings: {
      cpu: cpuCrossing,
      memory: memoryCrossing,
      fee: feeCrossing,
      total: cpuCrossing.crossingCount + memoryCrossing.crossingCount + feeCrossing.crossingCount,
    },
    expensiveFixtures: groupTopExpensiveFixtures(
      withData,
      options.topN ?? DEFAULT_TOP_FIXTURES,
    ),
    trend: trend.points,
    trendDownsampled: trend.downsampled,
    trendBucketMs: trend.bucketMs,
    totals: {
      totalCpu: cpus.reduce((sum, value) => sum + value, 0),
      avgCpu: average(cpus),
      maxCpu: maxOf(cpus),
      totalMemory: memories.reduce((sum, value) => sum + value, 0),
      avgMemory: average(memories),
      maxMemory: maxOf(memories),
      totalFee: fees.reduce((sum, value) => sum + value, 0),
      avgFee: average(fees),
      maxFee: maxOf(fees),
    },
    expensiveSuccessCount,
    expensiveFailureCount,
  };
}

/**
 * Aggregates a campaign from raw runs. If any supplied run carries a campaign
 * association, only runs for `campaignId` are included. Legacy rows without
 * the association field are treated as belonging to the requested campaign.
 */
export function aggregateCampaignFeeInsight(
  campaignId: string,
  runs: readonly FuzzingRun[],
  options: FeeInsightOptions = {},
): CampaignFeeInsight {
  const samples = runs.map((run) =>
    extractRunFeeSample(run, mergeThresholds(options.thresholds)),
  );
  const scoped = samples.filter((sample) => sample.campaignId !== undefined);
  const selected = scoped.length > 0
    ? scoped.filter((sample) => sample.campaignId === campaignId)
    : samples;
  return aggregateFeeSamples(campaignId, selected, options);
}

export const buildCampaignFeeInsight = aggregateCampaignFeeInsight;
export const computeCampaignFeeInsight = aggregateCampaignFeeInsight;

// ---------------------------------------------------------------------------
// Per-run summary
// ---------------------------------------------------------------------------

export interface RunFeeSummary {
  runId: string;
  campaignId?: string;
  fixture: string;
  status: RunStatus;
  source: FeeDataSource;
  hasFeeData: boolean;
  cpuInstructions: number | null;
  memoryBytes: number | null;
  minResourceFee: number | null;
  feeWarnThreshold: number;
  levels: {
    cpu: ResourceLevel | 'unknown';
    memory: ResourceLevel | 'unknown';
    fee: ResourceLevel | 'unknown';
    overall: ResourceLevel | 'unknown';
  };
  thresholdCrossings: MetricThresholdCrossing[];
  expensiveSuccess: boolean;
  expensiveFailure: boolean;
  href: string;
  campaignHref?: string;
}

function levelFor(
  value: number | null,
  warning: number,
  critical: number,
): ResourceLevel | 'unknown' {
  return value === null ? 'unknown' : classifyResourceLevel(value, warning, critical);
}

/**
 * Summary used by the run-detail chip and `GET /api/runs/[id]/fee-summary`.
 * Prefers the W5-A12 envelope and falls back to flat resource metrics.
 */
export function buildRunFeeSummary(
  run: FuzzingRun,
  overrides: Partial<ResourceThresholds> = {},
): RunFeeSummary {
  const thresholds = mergeThresholds(overrides);
  const sample = extractRunFeeSample(run, thresholds);
  const feeWarnThreshold = sample.feeWarnThreshold ?? thresholds.feeWarning;

  const cpuLevel = levelFor(sample.cpuInstructions, thresholds.cpuWarning, thresholds.cpuCritical);
  const memoryLevel = levelFor(sample.memoryBytes, thresholds.memoryWarning, thresholds.memoryCritical);
  const feeLevel = levelFor(sample.minResourceFee, feeWarnThreshold, thresholds.feeCritical);

  const rank: Record<ResourceLevel | 'unknown', number> = {
    unknown: 0,
    normal: 1,
    warning: 2,
    critical: 3,
  };
  const overall = [cpuLevel, memoryLevel, feeLevel].reduce((worst, level) =>
    rank[level] > rank[worst] ? level : worst,
  );

  const crossings: MetricThresholdCrossing[] = [];
  if (sample.cpuInstructions !== null) {
    crossings.push(
      countThresholdCrossings(
        [sample.cpuInstructions],
        'cpu',
        thresholds.cpuWarning,
        thresholds.cpuCritical,
      ),
    );
  }
  if (sample.memoryBytes !== null) {
    crossings.push(
      countThresholdCrossings(
        [sample.memoryBytes],
        'memory',
        thresholds.memoryWarning,
        thresholds.memoryCritical,
      ),
    );
  }
  if (sample.minResourceFee !== null) {
    crossings.push(
      countThresholdCrossings(
        [sample.minResourceFee],
        'fee',
        feeWarnThreshold,
        thresholds.feeCritical,
      ),
    );
  }

  return {
    runId: sample.runId,
    ...(sample.campaignId ? { campaignId: sample.campaignId } : {}),
    fixture: sample.fixture,
    status: sample.status,
    source: sample.source,
    hasFeeData: sample.hasFeeData,
    cpuInstructions: sample.cpuInstructions,
    memoryBytes: sample.memoryBytes,
    minResourceFee: sample.minResourceFee,
    feeWarnThreshold,
    levels: {
      cpu: cpuLevel,
      memory: memoryLevel,
      fee: feeLevel,
      overall,
    },
    thresholdCrossings: crossings.filter((crossing) => crossing.crossingCount > 0),
    expensiveSuccess: sample.expensiveSuccess,
    expensiveFailure: sample.expensiveFailure,
    href: `/runs/${encodeURIComponent(sample.runId)}`,
    ...(sample.campaignId
      ? { campaignHref: `/campaigns/${encodeURIComponent(sample.campaignId)}` }
      : {}),
  };
}
