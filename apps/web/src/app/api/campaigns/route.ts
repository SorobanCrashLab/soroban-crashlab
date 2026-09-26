import { NextRequest } from 'next/server';
import { readJsonBody, withRouteErrorHandling } from '@/lib/route-handler';
import { createdResponse, successResponse } from '@/lib/api-response-utils';
import { codedErrorResponse } from '@/lib/error-codes';
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

const IDEMPOTENCY_SCOPE = 'POST /api/campaigns';

interface CampaignResponse {
  campaign: Record<string, unknown> & { id: string };
}

/**
 * POST /api/campaigns
 *
 * Idempotency (#1634): send an `Idempotency-Key` header to make retries safe.
 *  - first request with a key       → 201, campaign created, result stored 24h
 *  - same key, same payload         → 200, the original campaign replayed
 *                                     (`Idempotent-Replayed: true`)
 *  - same key, different payload    → 422 IDEMPOTENCY_KEY_REUSED
 *  - malformed key                  → 400 IDEMPOTENCY_KEY_INVALID
 * Requests without the header behave as before (201, always a new campaign).
 */
export const POST = withRouteErrorHandling('POST /api/campaigns', async (request: NextRequest) => {
  const parsedKey = parseIdempotencyKey(request.headers.get(IDEMPOTENCY_KEY_HEADER));
  if (!parsedKey.ok) return codedErrorResponse('IDEMPOTENCY_KEY_INVALID', parsedKey.error);

  const parsedBody = await readJsonBody(request);
  if ('error' in parsedBody) return parsedBody.error;
  const payload = parsedBody.body as Record<string, unknown>;

  const key = parsedKey.key;
  const store = key ? selectIdempotencyStore() : null;

  if (key && store) {
    const existing = await store.get<CampaignResponse>(IDEMPOTENCY_SCOPE, key);
    if (existing) return replayOrReject(existing.fingerprint, existing.response, payload, key);
  }

  const campaign = {
    id: `campaign-${Date.now()}`,
    status: 'queued',
    createdAt: new Date().toISOString(),
    ...payload,
  };
  const response: CampaignResponse = { campaign };

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

  const created = createdResponse(response);
  if (key) {
    created.headers.set(IDEMPOTENCY_KEY_HEADER, key);
    created.headers.set(IDEMPOTENT_REPLAYED_HEADER, 'false');
  }
  return created;
});

function replayOrReject(
  storedFingerprint: string,
  storedResponse: CampaignResponse,
  payload: unknown,
  key: string,
) {
  if (storedFingerprint !== fingerprintPayload(payload)) {
    return codedErrorResponse('IDEMPOTENCY_KEY_REUSED');
  }
  const replay = successResponse(storedResponse, { status: 200 });
  replay.headers.set(IDEMPOTENCY_KEY_HEADER, key);
  replay.headers.set(IDEMPOTENT_REPLAYED_HEADER, 'true');
  return replay;
}
