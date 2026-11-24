import { successResponse } from '@/lib/api-response-utils';
import { logger } from '@/lib/logger';
import {
  checkDependencyHealth,
  defaultHealthCheckDependencies,
  HEALTH_CHECK_VERSION,
} from './health-check';

/**
 * GET /api/health
 * Health check with dependency status.
 *
 * Returns an aggregate report for the dashboard's core dependencies:
 * database, Prometheus metrics exporter, and the optional backend, plus
 * config presence for each integration. Responds 503 only when a critical
 * dependency (database, or a configured backend) is unavailable.
 */
export async function GET() {
  try {
    const report = await checkDependencyHealth(
      defaultHealthCheckDependencies(),
    );
    const httpStatus = report.status === 'unhealthy' ? 503 : 200;
    return successResponse(report, { status: httpStatus });
  } catch (error) {
    logger.error('GET /api/health failed', { error });
    return successResponse(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptimeSec: 0,
        version: HEALTH_CHECK_VERSION,
        dependencies: {},
        error:
          error instanceof Error ? error.message : 'An unexpected error occurred',
      },
      { status: 503 },
    );
  }
}
