import { NextRequest } from 'next/server';
import { withRouteErrorHandling } from '../../../../../../lib/route-handler';
import { successResponse, errorResponse } from '../../../../../../lib/api-response-utils';
import { getWebhookStore } from '../../../../../../lib/webhook-store';
import { recordAuditEvent } from '../../../../../../lib/audit/audit-sink';

/**
 * Immediately revokes a grace-period signing secret (#1663), terminating its
 * acceptance window before the TTL elapses.
 */
export const POST = withRouteErrorHandling(
  'POST /api/webhooks/signing-secrets/[keyId]/revoke-grace',
  async (_request: NextRequest, context: { params: Promise<{ keyId: string }> }) => {
    const { keyId } = await context.params;
    if (!keyId) {
      return errorResponse('Signing secret key id required.', 400);
    }

    const store = getWebhookStore();

    // Refuse to revoke the active secret — only a grace secret may be cut
    // short. The store keeps the verb narrow for exactly this reason.
    const active = store.getActiveSigningSecretRecord();
    if (active?.keyId === keyId || active?.id === keyId) {
      return errorResponse('The active signing secret cannot be revoked; rotate it instead.', 400);
    }

    const revoked = store.revokeGraceSigningSecret(keyId);
    if (!revoked) {
      return errorResponse('Signing secret not found or already revoked.', 404);
    }

    recordAuditEvent({
      action: 'webhook.secret.revokeGrace',
      target: keyId,
      metadata: { reason: 'manual revoke-grace from settings UI' },
    });

    return successResponse({
      message: 'Grace-period signing secret revoked.',
      records: store.listSigningSecretRecords(),
    });
  },
);