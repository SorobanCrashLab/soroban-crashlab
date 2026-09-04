/**
 * Resource Fee Utilities
 * 
 * Provides utilities for calculating and analyzing Soroban resource fees,
 * including CPU instructions, memory usage, and stroops conversions.
 */

export interface ResourceUsage {
  cpuInstructions: number;
  memoryBytes: number;
  minResourceFee: number;
}

export interface ResourceThresholds {
  cpu: number;
  memory: number;
  fee: number;
}

export const DEFAULT_THRESHOLDS: ResourceThresholds = {
  cpu: 900_000,
  memory: 7_000_000,
  fee: 3_000,
};

/**
 * Determine if a run is considered "expensive" based on resource thresholds
 */
export function isExpensiveRun(
  usage: ResourceUsage,
  thresholds: ResourceThresholds = DEFAULT_THRESHOLDS
): boolean {
  return (
    usage.cpuInstructions >= thresholds.cpu ||
    usage.memoryBytes >= thresholds.memory ||
    usage.minResourceFee >= thresholds.fee
  );
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format fee in stroops
 */
export function formatFee(fee: number): string {
  if (fee < 0) return '0 stroops';
  return `${fee.toLocaleString()} stroops`;
}

/**
 * Calculate total resource cost score (normalized 0-100)
 * Higher score means more expensive
 */
export function calculateResourceScore(
  usage: ResourceUsage,
  thresholds: ResourceThresholds = DEFAULT_THRESHOLDS
): number {
  const cpuScore = Math.min(100, (usage.cpuInstructions / thresholds.cpu) * 100);
  const memScore = Math.min(100, (usage.memoryBytes / thresholds.memory) * 100);
  const feeScore = Math.min(100, (usage.minResourceFee / thresholds.fee) * 100);
  
  return Math.max(cpuScore, memScore, feeScore);
}

/**
 * Get resource category based on usage
 */
export function getResourceCategory(
  usage: ResourceUsage,
  thresholds: ResourceThresholds = DEFAULT_THRESHOLDS
): 'low' | 'medium' | 'high' | 'critical' {
  const score = calculateResourceScore(usage, thresholds);
  
  if (score < 25) return 'low';
  if (score < 50) return 'medium';
  if (score < 75) return 'high';
  return 'critical';
}

/**
 * Compare two resource usages
 */
export function compareResourceUsage(
  a: ResourceUsage,
  b: ResourceUsage
): number {
  const scoreA = calculateResourceScore(a);
  const scoreB = calculateResourceScore(b);
  return scoreB - scoreA; // Sort descending (most expensive first)
}

/**
 * Calculate percentage difference between two resource values
 */
export function calculateResourceDelta(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

/**
 * Parse resource fee from string (handles various formats)
 */
export function parseResourceFee(input: string): number | null {
  const cleaned = input.replace(/[^0-9]/g, '');
  const parsed = parseInt(cleaned, 10);
  return isNaN(parsed) ? null : parsed;
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

/** Y-axis domain clamped at zero for fee metrics. */
export const FEE_Y_DOMAIN: readonly [number, string] = [0, 'auto'] as const;

export function getFeeYDomain(): readonly [number, string] {
  return FEE_Y_DOMAIN;
}

export function formatMalformedFeeCaption(droppedCount: number): string | null {
  if (droppedCount === 0) return null;
  return `${droppedCount} malformed fee ${droppedCount === 1 ? 'row' : 'rows'} hidden`;
}
