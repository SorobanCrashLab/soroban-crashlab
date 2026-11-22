/**
 * In-memory campaign timeline registry (#1874).
 *
 * Campaigns are created by `POST /api/campaigns`; workers report progress
 * samples and lifecycle markers here. The timeline endpoint downsamples the
 * stored samples on read. Like the rest of the web app's stores this is a
 * process-local singleton — production replaces it with a durable adapter,
 * which is why every accessor takes an explicit campaign id.
 *
 * Bounded memory: samples, failures and markers are capped, dropping the
 * oldest entries first. Campaigns themselves are capped too so a long-running
 * process cannot accumulate unbounded campaign records.
 */

import {
  buildCampaignTimeline,
  type BuildCampaignTimelineInput,
  type CampaignTimelineCrash,
  type CampaignTimelineFailure,
  type CampaignTimelineMarker,
  type CampaignTimelineMarkerKind,
  type CampaignTimelineSample,
  type CampaignTimelineSeries,
} from './campaign-timeline';

export const MAX_STORED_CAMPAIGNS = 1_000;
export const MAX_STORED_SAMPLES = 20_000;
export const MAX_STORED_FAILURES = 5_000;
export const MAX_STORED_MARKERS = 1_000;

export type CampaignStatus = 'queued' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';

export interface CampaignTarget {
  area?: string;
  preset?: string;
  seeds?: number;
  workers?: number;
}

export interface CampaignRecord {
  id: string;
  name?: string;
  status: CampaignStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  target?: CampaignTarget;
  samples: CampaignTimelineSample[];
  markers: CampaignTimelineMarker[];
  failures: CampaignTimelineFailure[];
  lastSampleAt?: string;
}

export interface CampaignTimelineResponse extends CampaignTimelineSeries {
  campaign: {
    id: string;
    name?: string;
    status: CampaignStatus;
    createdAt: string;
    startedAt?: string;
    finishedAt?: string;
  };
}

const campaigns = new Map<string, CampaignRecord>();

function parseTime(value: string | undefined): number | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoOrNull(value: string | undefined): string | null {
  const parsed = parseTime(value);
  return parsed === null ? null : new Date(parsed).toISOString();
}

/** Keeps the newest entries when a bounded list overflows. */
function trimOldest<T>(entries: T[], max: number, at: (entry: T) => string): void {
  if (entries.length <= max) return;
  entries.sort((a, b) => (parseTime(at(a)) ?? 0) - (parseTime(at(b)) ?? 0));
  entries.splice(0, entries.length - max);
}

function evictOldestCampaignIfNeeded(): void {
  if (campaigns.size <= MAX_STORED_CAMPAIGNS) return;
  let oldestId: string | null = null;
  let oldestAt = Number.POSITIVE_INFINITY;
  for (const record of campaigns.values()) {
    const at = parseTime(record.createdAt) ?? Number.POSITIVE_INFINITY;
    if (at < oldestAt) {
      oldestAt = at;
      oldestId = record.id;
    }
  }
  if (oldestId !== null) campaigns.delete(oldestId);
}

export interface RegisterCampaignInput {
  id: string;
  name?: string;
  status?: CampaignStatus;
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
  target?: CampaignTarget;
}

const START_LABEL = 'Campaign started';

/**
 * Creates a campaign record and its initial `campaign_start` marker.
 * Registering an existing id refreshes mutable metadata (status/name) without
 * duplicating the start marker or dropping the collected samples.
 */
export function registerCampaign(input: RegisterCampaignInput): CampaignRecord | null {
  const id = typeof input.id === 'string' ? input.id.trim() : '';
  if (id.length === 0) return null;

  const createdAt = isoOrNull(input.createdAt) ?? new Date().toISOString();
  const existing = campaigns.get(id);

  if (existing) {
    if (input.name !== undefined) existing.name = input.name;
    if (input.status !== undefined) existing.status = input.status;
    if (input.startedAt !== undefined) existing.startedAt = isoOrNull(input.startedAt) ?? existing.startedAt;
    if (input.finishedAt !== undefined) existing.finishedAt = isoOrNull(input.finishedAt) ?? existing.finishedAt;
    if (input.target !== undefined) existing.target = { ...existing.target, ...input.target };
    return existing;
  }

  const record: CampaignRecord = {
    id,
    name: input.name,
    status: input.status ?? 'queued',
    createdAt,
    startedAt: isoOrNull(input.startedAt) ?? undefined,
    finishedAt: isoOrNull(input.finishedAt) ?? undefined,
    target: input.target,
    samples: [],
    markers: [
      {
        id: `${id}-start`,
        kind: 'campaign_start',
        at: createdAt,
        label: START_LABEL,
        ...(input.name ? { detail: input.name } : {}),
      },
    ],
    failures: [],
  };
  campaigns.set(id, record);
  evictOldestCampaignIfNeeded();
  return record;
}

export function getCampaign(id: string): CampaignRecord | undefined {
  return campaigns.get(id);
}

export function listCampaigns(): CampaignRecord[] {
  return [...campaigns.values()];
}

/** De-duplicates crash points by explicit id, else signature + timestamp. */
function pushFailure(record: CampaignRecord, at: string, crash: CampaignTimelineCrash): void {
  const signature = typeof crash.signature === 'string' ? crash.signature : '';
  if (signature.length === 0) return;
  const id =
    typeof crash.id === 'string' && crash.id.length > 0
      ? crash.id
      : `${record.id}-${at}-${signature}`;
  if (record.failures.some((failure) => failure.id === id)) return;
  record.failures.push({
    id,
    at,
    signature,
    ...(crash.runId ? { runId: crash.runId } : {}),
    ...(crash.severity ? { severity: crash.severity } : {}),
  });
  trimOldest(record.failures, MAX_STORED_FAILURES, (failure) => failure.at);
}

/**
 * Appends a progress sample. Individual crashes (or, when omitted, the
 * sample's distinct signatures) become click-through failure points so the
 * density lane and the failure list stay in sync with the series.
 */
export function recordCampaignSample(
  campaignId: string,
  sample: CampaignTimelineSample,
): CampaignRecord | null {
  const record = campaigns.get(campaignId);
  if (!record) return null;
  const at = isoOrNull(sample.at);
  if (at === null) return null;

  const seeds = Number.isFinite(sample.seeds) && sample.seeds > 0 ? sample.seeds : 0;
  const failures = Number.isFinite(sample.failures) && sample.failures > 0 ? sample.failures : 0;
  const signatures = [
    ...new Set(
      (sample.signatures ?? []).filter(
        (signature): signature is string => typeof signature === 'string' && signature.length > 0,
      ),
    ),
  ].sort();

  record.samples.push({
    at,
    seeds,
    failures,
    ...(signatures.length > 0 ? { signatures } : {}),
    ...(sample.crashes ? { crashes: sample.crashes } : {}),
  });
  trimOldest(record.samples, MAX_STORED_SAMPLES, (entry) => entry.at);
  record.lastSampleAt =
    record.lastSampleAt === undefined || (parseTime(at) ?? 0) >= (parseTime(record.lastSampleAt) ?? 0)
      ? at
      : record.lastSampleAt;

  if (sample.crashes && sample.crashes.length > 0) {
    for (const crash of sample.crashes) pushFailure(record, at, crash);
  } else {
    for (const signature of signatures) pushFailure(record, at, { signature });
  }

  return record;
}

/** Appends a lifecycle/worker/dictionary marker, de-duplicating by id. */
export function recordCampaignMarker(
  campaignId: string,
  marker: Omit<CampaignTimelineMarker, 'id'> & { id?: string },
): CampaignRecord | null {
  const record = campaigns.get(campaignId);
  if (!record) return null;
  const at = isoOrNull(marker.at);
  if (at === null) return null;
  const kind: CampaignTimelineMarkerKind = marker.kind;
  const id = marker.id ?? `${record.id}-${kind}-${at}`;
  if (record.markers.some((entry) => entry.id === id)) return record;
  record.markers.push({
    id,
    kind,
    at,
    label: marker.label,
    ...(marker.detail ? { detail: marker.detail } : {}),
    ...(marker.runId ? { runId: marker.runId } : {}),
  });
  trimOldest(record.markers, MAX_STORED_MARKERS, (entry) => entry.at);
  return record;
}

export function recordCampaignFailure(
  campaignId: string,
  failure: Omit<CampaignTimelineFailure, 'id'> & { id?: string },
): CampaignRecord | null {
  const record = campaigns.get(campaignId);
  if (!record) return null;
  const at = isoOrNull(failure.at);
  if (at === null) return null;
  pushFailure(record, at, {
    id: failure.id,
    signature: failure.signature,
    runId: failure.runId,
    severity: failure.severity,
  });
  return record;
}

export type CampaignTimelineOptions = Pick<BuildCampaignTimelineInput, 'buckets' | 'range' | 'now'>;

/** Builds the downsampled series for a campaign; `null` when unknown. */
export function buildCampaignTimelineFor(
  campaignId: string,
  options: CampaignTimelineOptions = {},
): CampaignTimelineResponse | null {
  const record = campaigns.get(campaignId);
  if (!record) return null;
  const series = buildCampaignTimeline({
    campaignId,
    samples: record.samples,
    markers: record.markers,
    failures: record.failures,
    ...options,
  });
  return {
    ...series,
    campaign: {
      id: record.id,
      name: record.name,
      status: record.status,
      createdAt: record.createdAt,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
    },
  };
}

/** Test/worker helper: mark a status transition and append its marker. */
export function markCampaignStatus(
  campaignId: string,
  status: CampaignStatus,
  at: string = new Date().toISOString(),
): CampaignRecord | null {
  const record = campaigns.get(campaignId);
  if (!record) return null;
  record.status = status;
  if (status === 'running' && record.startedAt === undefined) record.startedAt = at;
  if (['completed', 'cancelled', 'failed'].includes(status)) record.finishedAt = at;

  const kindByStatus: Partial<Record<CampaignStatus, CampaignTimelineMarkerKind>> = {
    paused: 'campaign_pause',
    running: 'campaign_resume',
    cancelled: 'campaign_cancel',
  };
  const kind = kindByStatus[status];
  if (kind) {
    const labels: Record<string, string> = {
      campaign_pause: 'Campaign paused',
      campaign_resume: 'Campaign resumed',
      campaign_cancel: 'Campaign cancelled',
    };
    recordCampaignMarker(campaignId, { kind, at, label: labels[kind] });
  }
  return record;
}

/** Drops every campaign. Used by tests and by workers starting a clean run. */
export function resetCampaignRegistry(): void {
  campaigns.clear();
}
