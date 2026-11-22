/**
 * Campaign time-series bucketing (#1874).
 *
 * Campaign workers report raw progress samples (`at`, `seeds`, `failures`,
 * signatures). A multi-day campaign can accumulate hundreds of thousands of
 * them, so the timeline endpoint never ships raw samples: this module folds
 * them into a bounded number of buckets (at most `MAX_TIMELINE_BUCKETS`) and
 * reports whether downsampling happened. The series is also the backing data
 * for the scrubber's readout and failure-density lane.
 *
 * Pure: no I/O, no clock other than the `now` fallback for empty input.
 */

export const DEFAULT_TIMELINE_BUCKETS = 240;
export const MAX_TIMELINE_BUCKETS = 500;
/** Buckets never get narrower than this, so short campaigns stay readable. */
export const MIN_TIMELINE_BUCKET_MS = 1_000;
/** Distinct signatures echoed per bucket; the full count is kept separately. */
export const MAX_BUCKET_SIGNATURES = 20;

export type CampaignTimelineMarkerKind =
  | 'campaign_start'
  | 'campaign_pause'
  | 'campaign_resume'
  | 'campaign_cancel'
  | 'checkpoint'
  | 'worker_join'
  | 'worker_leave'
  | 'dictionary_change';

export interface CampaignTimelineSample {
  /** ISO-8601 timestamp the sample covers. */
  at: string;
  /** Seeds executed during the sample interval. */
  seeds: number;
  /** Failures observed during the sample interval. */
  failures: number;
  /** Distinct failure signatures observed (optional, bounded at ingest). */
  signatures?: string[];
  /**
   * Individual crashes, when the worker reports them. These become the
   * click-through failure points in the density lane.
   */
  crashes?: CampaignTimelineCrash[];
}

export interface CampaignTimelineCrash {
  id?: string;
  signature: string;
  runId?: string;
  severity?: string;
}

export interface CampaignTimelineMarker {
  id: string;
  kind: CampaignTimelineMarkerKind;
  at: string;
  label: string;
  detail?: string;
  runId?: string;
}

export interface CampaignTimelineFailure {
  id: string;
  at: string;
  signature: string;
  runId?: string;
  severity?: string;
}

export interface CampaignTimelineBucket {
  start: string;
  end: string;
  /** Seeds executed in the bucket. */
  seeds: number;
  /** Failures observed in the bucket. */
  failures: number;
  /** `failures / seeds`, or 0 for a bucket with no seeds. */
  failureRate: number;
  /** Number of distinct signatures observed in the bucket. */
  signatureCount: number;
  /** A bounded sample of the bucket's distinct signatures. */
  signatures: string[];
}

export interface CampaignTimelineSummary {
  seeds: number;
  failures: number;
  failureRate: number;
  distinctSignatures: number;
}

export interface CampaignTimelineSeries {
  campaignId: string;
  range: { start: string; end: string };
  bucketCount: number;
  bucketWidthMs: number;
  /** Raw samples that fell inside the range. */
  sampledPoints: number;
  /** True when raw samples were folded into buckets or the cap clamped the request. */
  downsampled: boolean;
  requestedBuckets: number;
  buckets: CampaignTimelineBucket[];
  markers: CampaignTimelineMarker[];
  failures: CampaignTimelineFailure[];
  summary: CampaignTimelineSummary;
}

export interface BuildCampaignTimelineInput {
  campaignId: string;
  samples: ReadonlyArray<CampaignTimelineSample>;
  markers?: ReadonlyArray<CampaignTimelineMarker>;
  failures?: ReadonlyArray<CampaignTimelineFailure>;
  /** Explicit range; missing ends are filled from the data bounds. */
  range?: { start?: string; end?: string };
  /** Requested bucket count; clamped to [1, MAX_TIMELINE_BUCKETS]. */
  buckets?: number;
  now?: Date;
}

function parseTime(value: string | undefined): number | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function uniqueSignatures(signatures: ReadonlyArray<string> | undefined): string[] {
  if (!signatures) return [];
  const seen = new Set<string>();
  for (const signature of signatures) {
    if (typeof signature === 'string' && signature.length > 0) seen.add(signature);
  }
  return [...seen].sort();
}

/** Unique signatures across all crashes/failures in the series. */
function countDistinctSignatures(
  samples: ReadonlyArray<CampaignTimelineSample>,
  failures: ReadonlyArray<CampaignTimelineFailure>,
): number {
  const seen = new Set<string>();
  for (const failure of failures) seen.add(failure.signature);
  for (const sample of samples) {
    for (const signature of sample.signatures ?? []) {
      if (typeof signature === 'string' && signature.length > 0) seen.add(signature);
    }
  }
  return seen.size;
}

/**
 * Clamps a requested bucket count. Invalid input (NaN, Infinity, <= 0) falls
 * back to the default rather than producing an unbounded response.
 */
export function clampBucketCount(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return DEFAULT_TIMELINE_BUCKETS;
  return Math.min(MAX_TIMELINE_BUCKETS, Math.max(1, Math.floor(requested)));
}

/**
 * Folds samples into at most `buckets` evenly-sized buckets over the requested
 * range and attaches markers/failures that fall inside it.
 */
export function buildCampaignTimeline(input: BuildCampaignTimelineInput): CampaignTimelineSeries {
  const nowMs = (input.now ?? new Date()).getTime();
  const rawRequested = input.buckets;
  const requestedBuckets = clampBucketCount(rawRequested);

  interface RawSample {
    at: number;
    seeds: number;
    failures: number;
    signatures: string[];
  }

  const samples: RawSample[] = [];
  for (const sample of input.samples) {
    const at = parseTime(sample.at);
    if (at === null) continue;
    samples.push({
      at,
      seeds: nonNegative(sample.seeds),
      failures: nonNegative(sample.failures),
      signatures: uniqueSignatures(sample.signatures),
    });
  }
  samples.sort((a, b) => a.at - b.at);

  const markerEntries: Array<{ marker: CampaignTimelineMarker; at: number }> = [];
  for (const marker of input.markers ?? []) {
    const at = parseTime(marker.at);
    if (at === null) continue;
    markerEntries.push({ marker, at });
  }

  const failureEntries: Array<{ failure: CampaignTimelineFailure; at: number }> = [];
  for (const failure of input.failures ?? []) {
    const at = parseTime(failure.at);
    if (at === null) continue;
    failureEntries.push({ failure, at });
  }

  // Resolve the range: explicit bounds win, data bounds fill the gaps.
  const dataTimes = [
    ...samples.map((sample) => sample.at),
    ...markerEntries.map((entry) => entry.at),
    ...failureEntries.map((entry) => entry.at),
  ];
  const dataMin = dataTimes.length > 0 ? Math.min(...dataTimes) : nowMs;
  const dataMax = dataTimes.length > 0 ? Math.max(...dataTimes) : nowMs;

  const explicitStart = parseTime(input.range?.start);
  const explicitEnd = parseTime(input.range?.end);
  let start = explicitStart ?? dataMin;
  let end = explicitEnd ?? dataMax;
  if (!Number.isFinite(start)) start = dataMin;
  if (!Number.isFinite(end)) end = dataMax;
  // A zero-length (or inverted) range still needs a positive width.
  if (end <= start) end = start + 1;

  const rangeMs = end - start;
  const bucketWidthMs = Math.max(MIN_TIMELINE_BUCKET_MS, Math.ceil(rangeMs / requestedBuckets));
  const bucketCount = Math.max(1, Math.ceil(rangeMs / bucketWidthMs));

  const buckets: CampaignTimelineBucket[] = Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = start + index * bucketWidthMs;
    return {
      start: new Date(bucketStart).toISOString(),
      end: new Date(Math.min(end, bucketStart + bucketWidthMs)).toISOString(),
      seeds: 0,
      failures: 0,
      failureRate: 0,
      signatureCount: 0,
      signatures: [],
    };
  });

  const signatureSets: Array<Set<string>> = Array.from({ length: bucketCount }, () => new Set());

  function bucketIndex(at: number): number | null {
    if (at < start || at > end) return null;
    const index = Math.floor((at - start) / bucketWidthMs);
    return Math.min(bucketCount - 1, Math.max(0, index));
  }

  let sampledPoints = 0;
  for (const sample of samples) {
    const index = bucketIndex(sample.at);
    if (index === null) continue;
    sampledPoints += 1;
    const bucket = buckets[index];
    bucket.seeds += sample.seeds;
    bucket.failures += sample.failures;
    for (const signature of sample.signatures) signatureSets[index].add(signature);
  }

  for (let index = 0; index < buckets.length; index += 1) {
    const bucket = buckets[index];
    bucket.failureRate = bucket.seeds > 0 ? bucket.failures / bucket.seeds : 0;
    const signatures = [...signatureSets[index]].sort();
    bucket.signatureCount = signatures.length;
    bucket.signatures = signatures.slice(0, MAX_BUCKET_SIGNATURES);
  }

  const markers = markerEntries
    .filter((entry) => bucketIndex(entry.at) !== null)
    .sort((a, b) => a.at - b.at)
    .map((entry) => entry.marker);

  const failures = failureEntries
    .filter((entry) => bucketIndex(entry.at) !== null)
    .sort((a, b) => a.at - b.at)
    .map((entry) => entry.failure);

  const totalSeeds = samples.reduce(
    (sum, sample) => sum + (bucketIndex(sample.at) === null ? 0 : sample.seeds),
    0,
  );
  const totalFailures = samples.reduce(
    (sum, sample) => sum + (bucketIndex(sample.at) === null ? 0 : sample.failures),
    0,
  );

  return {
    campaignId: input.campaignId,
    range: { start: new Date(start).toISOString(), end: new Date(end).toISOString() },
    bucketCount,
    bucketWidthMs,
    sampledPoints,
    downsampled:
      (rawRequested !== undefined && Number.isFinite(rawRequested) && rawRequested > MAX_TIMELINE_BUCKETS) ||
      sampledPoints > bucketCount,
    requestedBuckets,
    buckets,
    markers,
    failures,
    summary: {
      seeds: totalSeeds,
      failures: totalFailures,
      failureRate: totalSeeds > 0 ? totalFailures / totalSeeds : 0,
      distinctSignatures: countDistinctSignatures(
        samples.map((sample) => ({ at: '', seeds: 0, failures: 0, signatures: sample.signatures })),
        failures,
      ),
    },
  };
}
