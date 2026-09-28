import { NextRequest } from 'next/server';
import { readJsonBody, withRouteErrorHandling } from '../../../../../lib/route-handler';
import { successResponse } from '../../../../../lib/api-response-utils';
import { getWebhookStore } from '../../../../../lib/webhook-store';
import { recordAuditEvent } from '../../../../../lib/audit/audit-sink';

/**
 * Rotates the webhook signing secret (#1663).
 *
 * The current active secret is demoted to a grace window (still accepted for
 * inbound verification until its TTL, configurable via
 * `CRASHLAB_WEBHOOK_SIGNING_GRACE_TTL_DAYS` or `graceTtlDays` in the body) and
 * a freshly generated secret becomes active for signing. The new secret is
 * returned exactly once in this response — it is never disclosed again.
 */
export const POST = withRouteErrorHandling('POST /api/webhooks/signing-secrets/rotate', async (request: NextRequest) => {
  const parsedBody = await readJsonBody(request);
  const graceTtlDays = 'body' in parsedBody && typeof parsedBody.body === 'object'
    ? (parsedBody.body as { graceTtlDays?: unknown }).graceTtlDays
    : undefined;
  const ttl =
    typeof graceTtlDays === 'number' && Number.isFinite(graceTtlDays) && graceTtlDays > 0
      ? graceTtlDays
      : undefined;

  const store = getWebhookStore();
  const { active, previousKeyId } = store.rotateSigningSecret(ttl);

  recordAuditEvent({
    action: 'webhook.secret.rotate',
    target: active.keyId,
    metadata: {
      previousKeyId: previousKeyId ?? null,
      graceTtlDays: ttl ?? undefined,
      status: active.status,
    },
  });

  return successResponse({
    message:
      'Signing secret rotated. The previous secret remains accepted in its grace window, then is revoked. Store the new secret safely — it will not be shown again.',
    // Shown exactly once, mirroring the API-token rotate contract.
    secret: active.secret,
    keyId: active.keyId,
    records: store.listSigningSecretRecords(),
  });
});