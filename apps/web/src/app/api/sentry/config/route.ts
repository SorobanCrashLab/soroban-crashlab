import { NextRequest } from 'next/server';
import {
  validateSentryConfig,
  type SentryConfig,
} from '@/app/integrate-sentry-integration-for-crash-reporting-utils';
import { errorResponse, successResponse } from '@/lib/api-response-utils';

// In-memory store (persists for the lifetime of the process)
let config: SentryConfig | null = null;

/**
 * GET /api/sentry/config
 * Returns the saved Sentry configuration, or 404 if none has been saved yet.
 */
export async function GET() {
  if (!config) {
    return errorResponse('No Sentry configuration saved yet.', 404);
  }
  return successResponse(config);
}

/**
 * POST /api/sentry/config
 * Validates and persists a Sentry configuration. Body: SentryConfig JSON.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Request body must be valid JSON.', 400);
  }

  if (typeof body !== 'object' || body === null) {
    return errorResponse('Request body must be a JSON object.', 400);
  }

  const candidate = body as SentryConfig;
  const validation = validateSentryConfig(candidate);
  if (!validation.isValid) {
    return errorResponse(validation.errors.join('; '), 422);
  }

  config = candidate;
  return successResponse(config);
}
