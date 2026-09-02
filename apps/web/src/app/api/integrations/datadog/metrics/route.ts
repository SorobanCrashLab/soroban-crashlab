/**
 * GET /api/integrations/datadog/metrics
 *
 * Returns Datadog metrics export configuration and status.
 * This endpoint provides information about the Datadog StatsD client
 * configuration for monitoring and debugging purposes.
 */

import { successResponse } from '@/lib/api-response-utils';
import { withRouteErrorHandling } from '@/lib/route-handler';

export const GET = withRouteErrorHandling(
  'GET /api/integrations/datadog/metrics',
  async () => {
    const isEnabled = process.env.DATADOG_ENABLED === 'true';
    const agentHost = process.env.DATADOG_AGENT_HOST || 'localhost';
    const agentPort = process.env.DATADOG_AGENT_PORT || '8125';

    // Return current configuration and status
    const metricsStatus = {
      enabled: isEnabled,
      config: {
        agentHost,
        agentPort: parseInt(agentPort, 10),
        prefix: 'soroban_crashlab.',
        globalTags: {
          env: process.env.NODE_ENV || 'development',
          service: 'soroban-crashlab-backend',
        },
      },
      status: isEnabled ? 'active' : 'mock',
      timestamp: new Date().toISOString(),
    };

    return successResponse(metricsStatus);
  },
  'Failed to retrieve Datadog metrics configuration',
);
