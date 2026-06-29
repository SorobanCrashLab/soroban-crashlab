import type { FuzzingRun } from './types';

export interface ResourceThresholds {
  cpuWarning: number;
  cpuCritical: number;
  memoryWarning: number;
  memoryCritical: number;
  feeWarning: number;
  feeCritical: number;
}

export const RESOURCE_THRESHOLDS: ResourceThresholds = {
  cpuWarning: 900_000,
  cpuCritical: 5_000_000,
  memoryWarning: 7_000_000,
  memoryCritical: 10_000_000,
  feeWarning: 3_000,
  feeCritical: 5_000,
};

export type ResourceLevel = 'normal' | 'warning' | 'critical';

export function classifyResourceLevel(
  value: number,
  warning: number,
  critical: number,
): ResourceLevel {
  if (value >= critical) return 'critical';
  if (value >= warning) return 'warning';
  return 'normal';
}

export function isExpensiveRun(
  run: FuzzingRun,
  thresholds: ResourceThresholds = RESOURCE_THRESHOLDS,
): boolean {
  return (
    run.cpuInstructions >= thresholds.cpuCritical ||
    run.memoryBytes >= thresholds.memoryCritical ||
    run.minResourceFee >= thresholds.feeCritical
  );
}

export interface ContractCallInfo {
  contract: string;
  method: string;
}

export function parseContractCall(run: FuzzingRun): ContractCallInfo | null {
  if (!run.crashDetail?.payload) return null;
  try {
    const parsed = JSON.parse(run.crashDetail.payload) as {
      contract?: string;
      method?: string;
    };
    if (typeof parsed.contract === 'string' && typeof parsed.method === 'string') {
      return { contract: parsed.contract, method: parsed.method };
    }
  } catch {
    return null;
  }
  return null;
}

export interface ContractCallFeeSummary {
  contract: string;
  method: string;
  runCount: number;
  maxFee: number;
  avgFee: number;
  maxCpu: number;
  representativeRunId: string;
}

export function groupRunsByContractCall(runs: FuzzingRun[]): ContractCallFeeSummary[] {
  const groups = new Map<string, FuzzingRun[]>();

  for (const run of runs) {
    const call = parseContractCall(run);
    if (!call) continue;
    const key = `${call.contract}::${call.method}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(run);
    groups.set(key, bucket);
  }

  return Array.from(groups.entries())
    .map(([key, bucket]) => {
      const [contract, method] = key.split('::');
      const totalFee = bucket.reduce((sum, run) => sum + run.minResourceFee, 0);
      const maxFee = Math.max(...bucket.map((run) => run.minResourceFee));
      const maxCpu = Math.max(...bucket.map((run) => run.cpuInstructions));
      const representative = bucket.reduce((best, run) =>
        run.minResourceFee > best.minResourceFee ? run : best,
      );
      return {
        contract,
        method,
        runCount: bucket.length,
        maxFee,
        avgFee: Math.round(totalFee / bucket.length),
        maxCpu,
        representativeRunId: representative.id,
      };
    })
    .sort((a, b) => b.maxFee - a.maxFee);
}
