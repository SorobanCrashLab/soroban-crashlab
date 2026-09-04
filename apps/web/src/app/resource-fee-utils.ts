import type { FuzzingRun } from './types';
import type { ContractCallInfo, ContractCallFeeSummary } from '../types';

// Re-exported from the shared contract-types module (../types) for backward
// compatibility — single source of truth lives in src/types/contracts.ts.
export type { ContractCallInfo, ContractCallFeeSummary } from '../types';

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

/**
 * Validate a single fee value: must be a finite number >= 0.
 * Keeps huge-but-valid numbers (e.g. 1e12) while rejecting all malformed forms.
 */
export function isValidFeeValue(fee: unknown): boolean {
  return typeof fee === 'number' && Number.isFinite(fee) && !Number.isNaN(fee) && fee >= 0;
}

export interface FeeSanitizeResult<T> {
  clean: T[];
  dropped: { count: number; ids: string[] };
}

/**
 * Pure sanitizer for fee series data.
 * Excludes rows with negative, NaN, Infinity, non-number (including string-number)
 * fees from plotting and returns the dropped run IDs for visible warning.
 * Never mutates input; free of chart-library imports for trivial testability.
 */
export function sanitizeFeeSeries<T extends { id: string; minResourceFee: unknown }>(
  rows: T[],
): FeeSanitizeResult<T> {
  const clean: T[] = [];
  const ids: string[] = [];
  for (const row of rows) {
    if (!isValidFeeValue(row.minResourceFee)) {
      ids.push(row.id);
      continue;
    }
    clean.push(row);
  }
  return { clean, dropped: { count: ids.length, ids } };
}

/** Y-axis domain clamped at zero for fee metrics — prevents negative dips from compressing the chart. */
export const FEE_Y_DOMAIN: readonly [number, string] = [0, 'auto'] as const;

export function getFeeYDomain(): readonly [number, string] {
  return FEE_Y_DOMAIN;
}

/** Caption helper for the dropped counter. */
export function formatMalformedFeeCaption(droppedCount: number): string | null {
  if (droppedCount === 0) return null;
  return `${droppedCount} malformed fee ${droppedCount === 1 ? 'row' : 'rows'} hidden`;
}
