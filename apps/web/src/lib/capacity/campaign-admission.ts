/**
 * Admission control for POST /api/campaigns (#1904): derive what a campaign
 * asks for from its payload, then check the class's scheduling window and the
 * scope's quotas. The route owns the HTTP side (error envelopes, override
 * authorisation, audit); this module is pure apart from its inputs.
 */

import {
  campaignClassForPreset,
  checkAdmission,
  DEFAULT_QUOTA_SCOPE,
  DEFAULT_SEEDS_BY_CLASS,
  effectiveLimit,
  isCampaignClass,
  secondsUntilNextUtcDay,
  type CampaignClass,
  type QuotaLimits,
  type QuotaUsage,
  type QuotaViolation,
  type ResourceRequest,
} from './quotas';
import { isWindowOpen, secondsUntilWindowOpens, type SchedulingWindows } from './windows';

/** Header a maintainer sends, with a reason, to bypass windows and quotas. */
export const QUOTA_OVERRIDE_HEADER = 'X-CrashLab-Quota-Override';
export const MAX_OVERRIDE_REASON_LENGTH = 200;

export interface CampaignResourceRequest extends ResourceRequest {
  scope: string;
  /** Cost attribution key; `default` until projects exist. */
  project: string;
}

const MAX_WORKERS = 1_024;
const MAX_COUNT = 1_000_000_000_000;

function readCount(
  payload: Record<string, unknown>,
  field: string,
  max: number,
): { ok: true; value: number | undefined } | { ok: false; error: string } {
  const value = payload[field];
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) {
    return { ok: false, error: `"${field}" must be an integer from 0 to ${max}.` };
  }
  return { ok: true, value };
}

/**
 * Reads the capacity-relevant fields of a campaign payload:
 *  - class:   `campaignClass`, else from `preset` (smoke/nightly/deep), else interactive
 *  - workers: `workers`, else `parallelism` (the dashboard form's field), else 1
 *  - seeds:   `seeds`, else the class's preset budget
 *  - rpcCalls: `rpcCalls`, else 0 (estimates are optional)
 */
export function deriveCampaignRequest(
  payload: Record<string, unknown>,
): { ok: true; request: CampaignResourceRequest } | { ok: false; error: string } {
  let campaignClass: CampaignClass;
  if (payload.campaignClass !== undefined) {
    if (!isCampaignClass(payload.campaignClass)) {
      return { ok: false, error: '"campaignClass" must be interactive, nightly or deep.' };
    }
    campaignClass = payload.campaignClass;
  } else {
    campaignClass = campaignClassForPreset(payload.preset) ?? 'interactive';
  }

  const workers = readCount(payload, 'workers', MAX_WORKERS);
  if (!workers.ok) return workers;
  const parallelism = readCount(payload, 'parallelism', MAX_WORKERS);
  if (!parallelism.ok) return parallelism;
  const seeds = readCount(payload, 'seeds', MAX_COUNT);
  if (!seeds.ok) return seeds;
  const rpcCalls = readCount(payload, 'rpcCalls', MAX_COUNT);
  if (!rpcCalls.ok) return rpcCalls;

  let project = 'default';
  if (payload.project !== undefined) {
    if (typeof payload.project !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(payload.project)) {
      return { ok: false, error: '"project" must be 1-64 of [A-Za-z0-9._-].' };
    }
    project = payload.project;
  }

  return {
    ok: true,
    request: {
      scope: DEFAULT_QUOTA_SCOPE,
      project,
      campaignClass,
      workers: Math.max(workers.value ?? parallelism.value ?? 1, 1),
      seeds: seeds.value ?? DEFAULT_SEEDS_BY_CLASS[campaignClass],
      rpcCalls: rpcCalls.value ?? 0,
    },
  };
}

export type CampaignAdmission =
  | { ok: true }
  | { ok: false; kind: 'window'; retryAfterSeconds: number }
  | { ok: false; kind: 'quota'; violation: QuotaViolation; retryAfterSeconds: number | null };

/** Window first (a closed window is not a capacity problem), then quotas. */
export function evaluateCampaignAdmission(input: {
  request: CampaignResourceRequest;
  limits: QuotaLimits;
  usage: QuotaUsage;
  windows: SchedulingWindows;
  now: Date;
}): CampaignAdmission {
  const { request, now } = input;
  if (!isWindowOpen(input.windows, request.campaignClass, now)) {
    return {
      ok: false,
      kind: 'window',
      retryAfterSeconds: secondsUntilWindowOpens(input.windows, request.campaignClass, now),
    };
  }
  const decision = checkAdmission(input.limits, input.usage, request, now);
  if (!decision.ok) {
    return { ok: false, kind: 'quota', violation: decision.violation, retryAfterSeconds: decision.retryAfterSeconds };
  }
  return { ok: true };
}

/** `null` when absent; an error when present but unusable. */
export function parseOverrideReason(raw: string | null): { reason: string | null } | { error: string } {
  if (raw === null) return { reason: null };
  const reason = raw.trim();
  if (reason.length === 0 || reason.length > MAX_OVERRIDE_REASON_LENGTH) {
    return { error: `${QUOTA_OVERRIDE_HEADER} must carry a reason of 1-${MAX_OVERRIDE_REASON_LENGTH} characters.` };
  }
  return { reason };
}

export type MidRunThrottle =
  | { throttle: false }
  | {
      throttle: true;
      code: 'SCHEDULING_WINDOW_CLOSED' | 'QUOTA_EXCEEDED';
      resource: 'seeds_per_day' | 'rpc_calls_per_day' | null;
      retryAfterSeconds: number;
    };

/**
 * Mid-run check answered on every progress report (#1904). A running campaign
 * is told to pause when its class's window has closed (deep work running into
 * peak hours) or when the scope has consumed more than this class may use
 * today — the same priority headroom as admission and the Rust `QuotaGuard`.
 */
export function evaluateMidRunThrottle(input: {
  campaignClass: CampaignClass;
  finished: boolean;
  limits: QuotaLimits;
  usage: QuotaUsage;
  windows: SchedulingWindows;
  now: Date;
}): MidRunThrottle {
  const { campaignClass, limits, usage, now } = input;
  if (input.finished) return { throttle: false };

  if (!isWindowOpen(input.windows, campaignClass, now)) {
    return {
      throttle: true,
      code: 'SCHEDULING_WINDOW_CLOSED',
      resource: null,
      retryAfterSeconds: secondsUntilWindowOpens(input.windows, campaignClass, now),
    };
  }

  const daily: Array<['seeds_per_day' | 'rpc_calls_per_day', number | null, number]> = [
    ['seeds_per_day', limits.seedsPerDay, usage.seedsToday],
    ['rpc_calls_per_day', limits.rpcCallsPerDay, usage.rpcCallsToday],
  ];
  for (const [resource, limit, used] of daily) {
    if (limit !== null && used > effectiveLimit(limit, campaignClass)) {
      return { throttle: true, code: 'QUOTA_EXCEEDED', resource, retryAfterSeconds: secondsUntilNextUtcDay(now) };
    }
  }
  return { throttle: false };
}
