import { FuzzingRun, RunArea, RunIssueLink, RunSeverity, RunStatus } from './types';

const failureScenarios: Array<{
  area: RunArea;
  severity: RunSeverity;
  failureCategory: string;
  signature: string;
  contract: string;
  method: string;
}> = [
  {
    area: 'auth',
    severity: 'high',
    failureCategory: 'InvariantViolation',
    signature: 'sig:token:transfer:assert_balance_nonnegative',
    contract: 'token',
    method: 'transfer',
  },
  {
    area: 'state',
    severity: 'critical',
    failureCategory: 'Panic',
    signature: 'sig:vault:rebalance:unwrap_budget_snapshot',
    contract: 'vault',
    method: 'rebalance',
  },
  {
    area: 'budget',
    severity: 'medium',
    failureCategory: 'BudgetExceeded',
    signature: 'sig:router:swap:budget_cpu_limit',
    contract: 'router',
    method: 'swap',
  },
];

const fallbackAreas: RunArea[] = ['auth', 'state', 'budget', 'xdr'];
const fallbackSeverities: RunSeverity[] = ['low', 'medium', 'high', 'critical'];
const statuses: RunStatus[] = ['completed', 'failed', 'running', 'cancelled', 'failed'];

const issueCatalog: Record<string, RunIssueLink[]> = {
  'sig:token:transfer:assert_balance_nonnegative': [
    {
      label: '#53 Run issue jump links',
      href: 'https://github.com/SorobanCrashLab/soroban-crashlab/issues/53',
    },
    {
      label: '#61 Transfer invariant follow-up',
      href: 'https://github.com/SorobanCrashLab/soroban-crashlab/issues/61',
    },
  ],
  'sig:vault:rebalance:unwrap_budget_snapshot': [
    {
      label: '#47 Vault rebalance panic',
      href: 'https://github.com/SorobanCrashLab/soroban-crashlab/issues/47',
    },
  ],
  'sig:router:swap:budget_cpu_limit': [
    {
      label: '#52 Status timeline for budget failures',
      href: 'https://github.com/SorobanCrashLab/soroban-crashlab/issues/52',
    },
    {
      label: '#55 Run heatmap for expensive swaps',
      href: 'https://github.com/SorobanCrashLab/soroban-crashlab/issues/55',
    },
  ],
};

export function buildMockRuns(): FuzzingRun[] {
  return Array.from({ length: 25 }, (_, index) => {
    const id = 1000 + index;
    const status = statuses[index % statuses.length];
    const failureScenario = failureScenarios[index % failureScenarios.length];
    const area = status === 'failed' ? failureScenario.area : fallbackAreas[index % fallbackAreas.length];
    const severity =
      status === 'failed' ? failureScenario.severity : fallbackSeverities[index % fallbackSeverities.length];
    const baseDate = new Date(Date.UTC(2026, 2, 1, 8, 0, 0) + index * 36 * 60 * 1000);
    const queuedAt = baseDate.toISOString();
    const startedAt = new Date(baseDate.getTime() + 15_000).toISOString();
    const duration = 120_000 + index * 95_000;
    const finishedAt = status === 'running' ? undefined : new Date(baseDate.getTime() + 15_000 + duration).toISOString();
    const signature = failureScenario.signature;

    return {
      id: `run-${id}`,
      status,
      area,
      severity,
      duration,
      seedCount: 10_000 + index * 1_250,
      cpuInstructions: 450_000 + index * 28_500,
      memoryBytes: 1_800_000 + index * 230_000,
      minResourceFee: 600 + index * 170,
      queuedAt,
      startedAt,
      finishedAt,
      crashDetail:
        status === 'failed'
          ? {
              failureCategory: failureScenario.failureCategory,
              signature,
              payload: JSON.stringify(
                {
                  contract: failureScenario.contract,
                  method: failureScenario.method,
                  args: {
                    from: `GABCD...${id}`,
                    to: `GXYZ...${id + 5}`,
                    amount: 1000 + index * 97,
                  },
                },
                null,
                2,
              ),
              replayAction: `cargo run --bin crash-replay -- --run-id run-${id}`,
            }
          : null,
      associatedIssues: status === 'failed' ? issueCatalog[signature] ?? [] : [],
      annotations: index % 5 === 0 ? ['Verified by maintainer', 'Related to contract state exhaustion'] : [],
    };
  }).reverse();
}
