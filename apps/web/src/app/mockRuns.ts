import { FuzzingRun, RunArea, RunSeverity, RunStatus } from './types';

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

export function buildMockRuns(): FuzzingRun[] {
  return Array.from({ length: 25 }, (_, index) => {
    const id = 1000 + index;
    const status = statuses[index % statuses.length];
    const failureScenario = failureScenarios[index % failureScenarios.length];
    const area = status === 'failed' ? failureScenario.area : fallbackAreas[index % fallbackAreas.length];
    const severity =
      status === 'failed' ? failureScenario.severity : fallbackSeverities[index % fallbackSeverities.length];

    return {
      id: `run-${id}`,
      status,
      area,
      severity,
      duration: 120_000 + index * 95_000,
      seedCount: 10_000 + index * 1_250,
      cpuInstructions: 450_000 + index * 28_500,
      memoryBytes: 1_800_000 + index * 230_000,
      minResourceFee: 600 + index * 170,
      crashDetail:
        status === 'failed'
          ? {
              failureCategory: failureScenario.failureCategory,
              signature: failureScenario.signature,
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
    };
  }).reverse();
}
