import { withRouteErrorHandling, readJsonBody } from '@/lib/route-handler';
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { withCsrfGuard } from '@/lib/csrf';
import { createdResponse, successResponse } from '@/lib/api-response-utils';
import { codedErrorResponse, ERROR_CODES } from '@/lib/error-codes';
import { withIdempotency } from '@/lib/idempotency-middleware';
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENT_REPLAYED_HEADER,
  parseIdempotencyKey,
} from '@/lib/idempotency-key';
import {
  buildIdempotencyRecord,
  fingerprintPayload,
  selectIdempotencyStore,
} from '@/lib/storage/idempotency-store';
import { recordAuditEvent } from '@/lib/audit';
import {
  deriveCampaignRequest,
  evaluateCampaignAdmission,
  parseOverrideReason,
  QUOTA_OVERRIDE_HEADER,
  type CampaignAdmission,
  type CampaignResourceRequest,
} from '@/lib/capacity/campaign-admission';
import { readQuotaLimits } from '@/lib/capacity/quotas';
import { getCapacityLedger } from '@/lib/capacity/usage-ledger';
import { readSchedulingWindows } from '@/lib/capacity/windows';
import { registerCampaign } from '@/lib/campaigns/campaign-registry';
import { resolvePrincipal, resolveRoleForPrincipal } from '@/lib/rbac';

const IDEMPOTENCY_SCOPE = 'POST /api/campaigns';

interface CampaignResponse {
  campaign: Record<string, unknown> & { id: string };
  /** What the campaign was admitted against (#1904). */
  capacity: {
    scope: string;
    project: string;
    campaignClass: CampaignResourceRequest['campaignClass'];
    workers: number;
    seeds: number;
    quotaOverride: boolean;
  };
}

/**
 * POST /api/campaigns
 *
 * Idempotency (#1634): send an `Idempotency-Key` header to make retries safe.
 *  - first request with a key       → 201, campaign created, result stored 24h
 *  - same key, same payload         → 200, the original campaign replayed
 *                                     (`Idempotent-Replayed: true`)
 *  - same key, request in flight    → 409 IDEMPOTENCY_IN_FLIGHT (+ Retry-After)
 *  - same key, different payload    → 422 IDEMPOTENCY_KEY_REUSED
 *  - malformed key                  → 400 IDEMPOTENCY_KEY_INVALID
 * Requests without the header behave as before (201, always a new campaign).
 *
 * Capacity (#1904), checked for new campaigns only (a replay was admitted
 * already):
 *  - class window closed            → 403 SCHEDULING_WINDOW_CLOSED (+ Retry-After)
 *  - quota exceeded                 → 429 QUOTA_EXCEEDED with { quota } details (+ Retry-After)
 *  - `X-CrashLab-Quota-Override: <reason>` lets a maintainer bypass both; the
 *    bypass is written to the audit log. Non-maintainers → 403 QUOTA_OVERRIDE_FORBIDDEN.
 * With no quotas or windows configured every campaign is admitted, as before.
 */
export const POST = withCsrfGuard(
  'POST /api/campaigns',
  withRouteErrorHandling('POST /api/campaigns', async (request: NextRequest) => {
    return withIdempotency(request, IDEMPOTENCY_SCOPE, async (ctx) => {
      return createCampaign(request, ctx);
    });
  }),
);

async function createCampaign(
  request: NextRequest,
  ctx: { key: string | null; store: ReturnType<typeof selectIdempotencyStore> | null },
) {
  const parsedKey = parseIdempotencyKey(request.headers.get(IDEMPOTENCY_KEY_HEADER));
  if (!parsedKey.ok) return codedErrorResponse('IDEMPOTENCY_KEY_INVALID', parsedKey.error);

  const parsedBody = await readJsonBody(request);
  if ('error' in parsedBody) return parsedBody.error;
  const payload = (parsedBody.body ?? {}) as Record<string, unknown>;

  const key = ctx.key;
  const store = ctx.store;

  if (key && store) {
    const existing = await store.get<CampaignResponse>(IDEMPOTENCY_SCOPE, key);
    if (existing) return replayOrReject(existing.fingerprint, existing.response, payload, key);
  }

  const derived = deriveCampaignRequest(payload ?? {});
  if (!derived.ok) return codedErrorResponse('VALIDATION_ERROR', derived.error);
  const resources = derived.request;

  const override = parseOverrideReason(request.headers.get(QUOTA_OVERRIDE_HEADER));
  if ('error' in override) return codedErrorResponse('VALIDATION_ERROR', override.error);

  const ledger = getCapacityLedger();
  const now = new Date();
  const admission = evaluateCampaignAdmission({
    request: resources,
    limits: readQuotaLimits(),
    usage: ledger.usage(resources.scope),
    windows: readSchedulingWindows().windows,
    now,
  });

  let overriddenBy: string | null = null;
  if (!admission.ok) {
    if (override.reason === null) return admissionRejected(admission);
    const principal = await resolvePrincipal(request);
    if ((await resolveRoleForPrincipal(principal)) !== 'maintainer') {
      return codedErrorResponse('QUOTA_OVERRIDE_FORBIDDEN');
    }
    overriddenBy = principal.subject;
  }

  const campaign = {
    // Random suffix: two campaigns created in the same millisecond must not
    // share an id, or one capacity lease would overwrite the other.
    id: `campaign-${Date.now()}-${randomUUID().slice(0, 8)}`,
    status: 'queued',
    createdAt: now.toISOString(),
    ...payload,
  };
  const response: CampaignResponse = {
    campaign,
    capacity: {
      scope: resources.scope,
      project: resources.project,
      campaignClass: resources.campaignClass,
      workers: resources.workers,
      seeds: resources.seeds,
      quotaOverride: overriddenBy !== null,
    },
  };

  if (key && store) {
    const record = buildIdempotencyRecord({
      scope: IDEMPOTENCY_SCOPE,
      key,
      payload,
      resourceId: campaign.id,
      response,
    });
    const winner = await store.putIfAbsent(record);
    // A concurrent request with the same key stored its campaign first.
    if (winner !== record) {
      return replayOrReject(winner.fingerprint, winner.response, payload, key);
    }
  }

  ledger.admit({ campaignId: campaign.id, ...resources });

  // The timeline (#1874) is keyed by campaign id; register the new campaign
  // (and its start marker) so `GET /api/campaigns/[id]/timeline` can serve it.
  registerCampaign({
    id: campaign.id,
    name:
      typeof payload.name === 'string' && payload.name.trim().length > 0
        ? payload.name.trim()
        : undefined,
    status: 'queued',
    createdAt: campaign.createdAt,
    target: {
      ...(typeof payload.area === 'string' ? { area: payload.area } : {}),
      ...(typeof payload.preset === 'string' ? { preset: payload.preset } : {}),
      seeds: resources.seeds,
      workers: resources.workers,
    },
  });

  if (overriddenBy !== null && !admission.ok) {
    recordAuditEvent({
      action: 'quota.override',
      actor: overriddenBy,
      target: campaign.id,
      metadata: {
        reason: override.reason,
        bypassed: admission.kind,
        ...(admission.kind === 'quota' ? { violation: admission.violation } : {}),
        campaignClass: resources.campaignClass,
        scope: resources.scope,
      },
    });
  }

  const created = createdResponse(response);
  if (key) {
    created.headers.set(IDEMPOTENCY_KEY_HEADER, key);
    created.headers.set(IDEMPOTENT_REPLAYED_HEADER, 'false');
  }
  return created;
}

function admissionRejected(admission: Exclude<CampaignAdmission, { ok: true }>): NextResponse {
  if (admission.kind === 'window') {
    const closed = codedErrorResponse('SCHEDULING_WINDOW_CLOSED');
    closed.headers.set('Retry-After', String(admission.retryAfterSeconds));
    return closed;
  }
  const entry = ERROR_CODES.QUOTA_EXCEEDED;
  const { resource, limit, used, requested } = admission.violation;
  const exceeded = NextResponse.json(
    {
      error: `Quota exceeded for ${resource}: ${used} used + ${requested} requested > ${limit} allowed.`,
      code: entry.code,
      quota: admission.violation,
    },
    { status: entry.httpStatus },
  );
  if (admission.retryAfterSeconds !== null) {
    exceeded.headers.set('Retry-After', String(admission.retryAfterSeconds));
  }
  return exceeded;
}

function replayOrReject(
  storedFingerprint: string,
  storedResponse: CampaignResponse,
  payload: unknown,
  key: string,
) : NextResponse {
  if (storedFingerprint !== fingerprintPayload(payload)) {
    return codedErrorResponse('IDEMPOTENCY_KEY_REUSED');
  }
  const replay = successResponse(storedResponse, { status: 200 });
  replay.headers.set(IDEMPOTENCY_KEY_HEADER, key);
  replay.headers.set(IDEMPOTENT_REPLAYED_HEADER, 'true');
  return replay;
}

export { createCampaign };