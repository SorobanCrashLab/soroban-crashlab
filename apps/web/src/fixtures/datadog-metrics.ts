/**
 * Mock Datadog metrics data for testing
 */

export interface DatadogMetric {
  name: string;
  value: number;
  type: 'gauge' | 'counter' | 'histogram';
  tags: string[];
  timestamp?: number;
}

export const mockDatadogMetrics: DatadogMetric[] = [
  {
    name: 'soroban_crashlab.runs.total',
    value: 142,
    type: 'counter',
    tags: ['env:development', 'service:soroban-crashlab-backend'],
  },
  {
    name: 'soroban_crashlab.runs.failed',
    value: 23,
    type: 'counter',
    tags: ['env:development', 'service:soroban-crashlab-backend'],
  },
  {
    name: 'soroban_crashlab.response.time',
    value: 245.8,
    type: 'histogram',
    tags: ['env:development', 'service:soroban-crashlab-backend', 'endpoint:/api/runs'],
  },
  {
    name: 'soroban_crashlab.memory.usage',
    value: 512,
    type: 'gauge',
    tags: ['env:development', 'service:soroban-crashlab-backend', 'unit:mb'],
  },
];
