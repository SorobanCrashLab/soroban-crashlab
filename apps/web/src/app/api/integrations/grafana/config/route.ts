/**
 * GET  /api/integrations/grafana/config  – load saved Grafana configuration
 * POST /api/integrations/grafana/config  – persist Grafana configuration
 *
 * In the absence of a persistent store this implementation uses a module-level
 * in-memory cache, matching the lightweight pattern used throughout this codebase.
 */

import { successResponse, errorResponse } from '@/lib/api-response-utils';
import type { GrafanaConfig } from '../../../../integrate-grafana-dashboard-annotation-api-utils';

// Module-level in-memory store (same pattern as other lightweight integrations).
let storedConfig: GrafanaConfig | null = null;

export async function GET() {
  if (!storedConfig) {
    return errorResponse('No configuration saved yet', 404);
  }
  return successResponse(storedConfig);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GrafanaConfig;

    if (!body || typeof body.baseUrl !== 'string') {
      return errorResponse('Invalid configuration payload', 400);
    }

    storedConfig = body;
    return successResponse({ success: true });
  } catch {
    return errorResponse('Failed to parse request body', 400);
  }
}
