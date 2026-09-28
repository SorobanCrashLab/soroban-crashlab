import { successResponse } from '../../../../lib/api-response-utils';
import { getWebhookStore } from '../../../../lib/webhook-store';

/**
 * Lists the webhook signing-secret records (status, key-id, expiry).
 *
 * The secret material itself is never returned — records are redacted to the
 * public identifiers, so this endpoint is safe for the settings UI to render
 * on every load.
 *
 * Issue: #1663 - Webhook signing secret rotation UI
 */
export async function GET() {
  const store = getWebhookStore();
  return successResponse({
    records: store.listSigningSecretRecords(),
  });
}

export const dynamic = 'force-dynamic';