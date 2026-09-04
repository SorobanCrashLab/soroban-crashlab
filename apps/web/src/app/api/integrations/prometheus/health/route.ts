import { successResponse } from '@/lib/api-response-utils';
import { logger } from '@/lib/logger';

/**
 * GET /api/integrations/prometheus/health
 * Prometheus Exporter Health Check.
 *
 * This route is used by the Prometheus poller or internal monitoring
 * to verify that the metrics exporter is operational.
 */
export async function GET() {
  try {
    // In a real implementation, we would check:
    // 1. Connection to the internal metrics store
    // 2. Availability of the metrics generation pipeline
    // 3. Any critical system health indicators

    const isHealthy = true; // Simulated health check

    if (!isHealthy) {
      return successResponse(
        { status: 'unhealthy', error: 'Metrics exporter is currently unavailable.' },
        { status: 503 }
      );
    }

    return successResponse({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  } catch (error) {
    logger.error('GET /api/integrations/prometheus/health failed', { error });
    return successResponse(
      { status: 'error', message: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
