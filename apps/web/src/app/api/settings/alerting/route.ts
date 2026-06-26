import { NextRequest, NextResponse } from 'next/server';
import {
  createDefaultAlertingSettingsSnapshot,
  readAlertingSettingsSnapshot,
  serializeAlertingSettingsSnapshot,
  validateAlertingSettingsSnapshot,
  type AlertingSettingsSnapshot,
} from '@/app/alerting-settings-page-utils';
import { jsonError, withRouteErrorHandling } from '@/lib/route-handler';

// In-memory store (persists for the lifetime of the process)
let store: AlertingSettingsSnapshot | null = null;

function getSnapshot(): AlertingSettingsSnapshot {
  if (!store) {
    store = createDefaultAlertingSettingsSnapshot();
  }
  return store;
}

/**
 * GET /api/settings/alerting
 * Returns the current alerting settings snapshot.
 */
export async function GET() {
  return NextResponse.json(getSnapshot());
}

/**
 * PUT /api/settings/alerting
 * Replaces the alerting settings snapshot. Body: AlertingSettingsSnapshot JSON.
 */
export const PUT = withRouteErrorHandling('PUT /api/settings/alerting', async (request: NextRequest) => {
  let body: string;
  try {
    body = await request.text();
  } catch {
    return jsonError('Failed to read request body', 400);
  }

  const result = readAlertingSettingsSnapshot(body);
  if (result.status === 'error' || !result.snapshot) {
    return jsonError(result.error ?? 'Invalid alerting settings payload', 422);
  }

  const validationError = validateAlertingSettingsSnapshot(result.snapshot);
  if (validationError) {
    return jsonError(validationError, 422);
  }

  store = {
    ...result.snapshot,
    lastUpdated: new Date().toISOString(),
  };

  return NextResponse.json(store);
});
