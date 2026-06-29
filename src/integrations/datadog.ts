import { StatsD } from 'hot-shots';
import * as dotenv from 'dotenv';

dotenv.config();

const isDatadogEnabled = process.env.DATADOG_ENABLED === 'true';

// Initialize the StatsD client targeting the Datadog Agent
export const datadogClient = new StatsD({
  host: process.env.DATADOG_AGENT_HOST || 'localhost',
  port: parseInt(process.env.DATADOG_AGENT_PORT || '8125', 10),
  prefix: 'soroban_crashlab.',
  globalTags: {
    env: process.env.NODE_ENV || 'development',
    service: 'soroban-crashlab-backend'
  },
  errorHandler: (error) => {
    console.error('Metrics export error encountered by Datadog StatsD:', error);
  },
  mock: !isDatadogEnabled // Disables network socket writes during local development/tests if disabled
});

/**
 * Utility metrics wrapper helper methods
 */
export const metrics = {
  increment(metricName: string, tags: string[] = []): void {
    datadogClient.increment(metricName, 1, tags);
  },

  histogram(metricName: string, value: number, tags: string[] = []): void {
    datadogClient.histogram(metricName, value, tags);
  },

  gauge(metricName: string, value: number, tags: string[] = []): void {
    datadogClient.gauge(metricName, value, tags);
  }
};