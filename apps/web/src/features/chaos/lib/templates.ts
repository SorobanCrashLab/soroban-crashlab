/** Experiment templates (#2340): safe starting points with halt rules preset. */

import type { ExperimentDefinition } from './model';

export interface ExperimentTemplate {
  id: string;
  name: string;
  description: string;
  definition: ExperimentDefinition;
}

const SAFE_GUARDRAILS: ExperimentDefinition['guardrails'] = {
  maxBlastRadiusPct: 5,
  maxConcurrentTargets: 2,
  environmentAllowlist: ['dev', 'staging'],
  maintenanceWindowOnly: true,
  requiredApprovals: 1,
};

export const EXPERIMENT_TEMPLATES: readonly ExperimentTemplate[] = [
  {
    id: 'rpc-latency-spike',
    name: 'RPC latency spike',
    description: 'Add 800 ms to Soroban RPC calls and confirm replay regression still completes within budget.',
    definition: {
      name: 'RPC latency spike',
      hypothesis: 'Replay regression tolerates +800 ms RPC latency without timeouts or failed runs.',
      targets: [{ kind: 'integration', id: 'soroban-rpc-testnet' }],
      faults: [{ type: 'latency', latencyMs: 800, jitterMs: 200 }],
      durationSec: 300,
      scheduledAt: null,
      guardrails: { ...SAFE_GUARDRAILS, maxBlastRadiusPct: 50, maxConcurrentTargets: 3 },
      haltRules: [
        { metric: 'error_rate', comparator: 'gt', threshold: 0.1, forSamples: 2 },
        { metric: 'p95_latency_ms', comparator: 'gt', threshold: 3_000, forSamples: 3 },
      ],
      tags: ['rpc', 'latency'],
    },
  },
  {
    id: 'runner-cpu-pressure',
    name: 'Runner CPU pressure',
    description: 'Saturate a dev runner to verify the scheduler backs off instead of failing runs.',
    definition: {
      name: 'Runner CPU pressure',
      hypothesis: 'The scheduler sheds load and no run fails when a runner is CPU-saturated.',
      targets: [{ kind: 'runner', id: 'runner-dev-1' }],
      faults: [{ type: 'cpu-pressure', cpuPercent: 85 }],
      durationSec: 180,
      scheduledAt: null,
      guardrails: { ...SAFE_GUARDRAILS, environmentAllowlist: ['dev'], requiredApprovals: 0, maintenanceWindowOnly: false },
      haltRules: [
        { metric: 'error_rate', comparator: 'gt', threshold: 0.1, forSamples: 2 },
        { metric: 'data_quality_score', comparator: 'lt', threshold: 0.95, forSamples: 2 },
      ],
      tags: ['runner', 'resources'],
    },
  },
  {
    id: 'integration-error-burst',
    name: 'Integration error burst',
    description: 'Return 503 for a fraction of RPC calls to exercise retries and circuit breaking.',
    definition: {
      name: 'Integration error burst',
      hypothesis: 'Retries absorb a 20% 503 burst and the SLO burn rate stays below 2×.',
      targets: [{ kind: 'integration', id: 'soroban-rpc-testnet' }],
      faults: [{ type: 'error', errorRate: 0.2, statusCode: 503 }],
      durationSec: 240,
      scheduledAt: null,
      guardrails: { ...SAFE_GUARDRAILS, maxBlastRadiusPct: 50, maxConcurrentTargets: 3 },
      haltRules: [
        { metric: 'slo_burn_rate', comparator: 'gt', threshold: 10, forSamples: 2 },
        { metric: 'incident_opened', comparator: 'gt', threshold: 0, forSamples: 1 },
      ],
      tags: ['rpc', 'errors'],
    },
  },
  {
    id: 'campaign-packet-drop',
    name: 'Campaign packet drop',
    description: 'Drop 10% of requests from a dev campaign to validate idempotent resubmission.',
    definition: {
      name: 'Campaign packet drop',
      hypothesis: 'Dropped submissions are retried idempotently and no seeds are lost.',
      targets: [{ kind: 'campaign', id: 'camp-auth-2026' }],
      faults: [{ type: 'drop', dropRate: 0.1 }],
      durationSec: 120,
      scheduledAt: null,
      guardrails: { ...SAFE_GUARDRAILS, environmentAllowlist: ['dev'], requiredApprovals: 0, maintenanceWindowOnly: false },
      haltRules: [{ metric: 'error_rate', comparator: 'gt', threshold: 0.2, forSamples: 2 }],
      tags: ['network'],
    },
  },
];

export function findExperimentTemplate(id: string): ExperimentTemplate | null {
  return EXPERIMENT_TEMPLATES.find((template) => template.id === id) ?? null;
}
