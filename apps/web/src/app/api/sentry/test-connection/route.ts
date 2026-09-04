import { NextRequest } from 'next/server';
import { testSentryConnection } from '@/lib/integrations/sentry-store';
import { errorResponse, successResponse } from '@/lib/api-response-utils';

/**
 * POST /api/sentry/test-connection
 * Checks whether a given DSN looks like a valid, reachable Sentry endpoint.
 * Body: { dsn: string }
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Request body must be valid JSON.', 400);
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as Record<string, unknown>).dsn !== 'string'
  ) {
    return errorResponse('Field "dsn" must be a string.', 400);
  }

  const result = testSentryConnection((body as { dsn: string }).dsn);
  return successResponse(result, { status: result.success ? 200 : 422 });
}
