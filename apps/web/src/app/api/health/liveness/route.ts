import { successResponse } from '@/lib/api-response-utils';

export const HEALTH_CHECK_VERSION = '1.0.0';

/**
 * GET /api/health/liveness
 * Pure liveness check.
 * 
 * Never touches external dependencies. Returns 200 OK if the process is up
 * and responding to HTTP requests. Use this for container restart policies.
 */
export async function GET() {
  return successResponse({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: HEALTH_CHECK_VERSION,
    type: 'liveness',
  });
}
