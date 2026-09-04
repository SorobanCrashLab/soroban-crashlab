import type { FuzzingRun, RunStatus, RunSeverity } from './types';

export interface RunStatusCounts {
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
}

export interface RunSeverityCounts {
  low: number;
  medium: number;
  high: number;
  critical: number;
}

export interface RunAggregateMetrics {
  totalRuns: number;
  statusCounts: RunStatusCounts;
  severityCounts: RunSeverityCounts;
  avgDuration: number;
  avgSeeds: number;
  avgCpu: number;
  avgMemory: number;
  avgFee: number;
  maxCpu: number;
  maxMemory: number;
  maxFee: number;
  failureRate: number;
  successRate: number;
  criticalCount: number;
  totalCrashes: number;
}

// ---------------------------------------------------------------------------
// Status / severity counting
// ---------------------------------------------------------------------------

export function countByStatus(runs: FuzzingRun[]): RunStatusCounts {
  const counts: RunStatusCounts = { running: 0, completed: 0, failed: 0, cancelled: 0 };
  for (const run of runs) {
    counts[run.status] += 1;
  }
  return counts;
}

export function countBySeverity(runs: FuzzingRun[]): RunSeverityCounts {
  const counts: RunSeverityCounts = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const run of runs) {
    counts[run.severity] += 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Single-metric averages & extrema
// ---------------------------------------------------------------------------

export function avgField(runs: FuzzingRun[], field: 'duration' | 'seedCount' | 'cpuInstructions' | 'memoryBytes' | 'minResourceFee'): number {
  if (runs.length === 0) return 0;
  return runs.reduce((sum, r) => sum + r[field], 0) / runs.length;
}

export function maxField(runs: FuzzingRun[], field: 'cpuInstructions' | 'memoryBytes' | 'minResourceFee'): number {
  if (runs.length === 0) return 0;
  let max = -Infinity;
  for (const run of runs) {
    if (run[field] > max) max = run[field];
  }
  return max;
}

export function sumField(runs: FuzzingRun[], field: 'duration' | 'seedCount' | 'cpuInstructions' | 'memoryBytes' | 'minResourceFee'): number {
  let sum = 0;
  for (const run of runs) {
    sum += run[field];
  }
  return sum;
}

// ---------------------------------------------------------------------------
// Convenience averages (rounded where appropriate)
// ---------------------------------------------------------------------------

export function avgDuration(runs: FuzzingRun[]): number {
  return avgField(runs, 'duration');
}

export function avgSeeds(runs: FuzzingRun[]): number {
  return avgField(runs, 'seedCount');
}

export function avgCpu(runs: FuzzingRun[]): number {
  return Math.round(avgField(runs, 'cpuInstructions'));
}

export function avgMemory(runs: FuzzingRun[]): number {
  return Math.round(avgField(runs, 'memoryBytes'));
}

export function avgFee(runs: FuzzingRun[]): number {
  return Math.round(avgField(runs, 'minResourceFee'));
}

export function maxCpu(runs: FuzzingRun[]): number {
  return maxField(runs, 'cpuInstructions');
}

export function maxMemory(runs: FuzzingRun[]): number {
  return maxField(runs, 'memoryBytes');
}

export function maxFee(runs: FuzzingRun[]): number {
  return maxField(runs, 'minResourceFee');
}

// ---------------------------------------------------------------------------
// Rates & counts
// ---------------------------------------------------------------------------

export function failureRate(runs: FuzzingRun[]): number {
  if (runs.length === 0) return 0;
  const failed = countByStatus(runs).failed;
  return (failed / runs.length) * 100;
}

export function successRate(runs: FuzzingRun[]): number {
  if (runs.length === 0) return 0;
  const completed = countByStatus(runs).completed;
  return (completed / runs.length) * 100;
}

export function criticalCount(runs: FuzzingRun[]): number {
  return countBySeverity(runs).critical;
}

export function totalCrashes(runs: FuzzingRun[]): number {
  let count = 0;
  for (const run of runs) {
    if (run.crashDetail !== null) count += 1;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export function filterByStatus(runs: FuzzingRun[], status: RunStatus): FuzzingRun[] {
  return runs.filter((r) => r.status === status);
}

export function filterByStatuses(runs: FuzzingRun[], statuses: RunStatus[]): FuzzingRun[] {
  return runs.filter((r) => statuses.includes(r.status));
}

export function filterBySeverity(runs: FuzzingRun[], severity: RunSeverity): FuzzingRun[] {
  return runs.filter((r) => r.severity === severity);
}

export function filterNonCancelled(runs: FuzzingRun[]): FuzzingRun[] {
  return runs.filter((r) => r.status !== 'cancelled');
}

export function filterWithCrash(runs: FuzzingRun[]): FuzzingRun[] {
  return runs.filter((r) => r.crashDetail !== null);
}

// ---------------------------------------------------------------------------
// Comparison helpers
// ---------------------------------------------------------------------------

export function deltaPercent(baseline: number, value: number): number {
  if (baseline === 0) return 0;
  return ((value - baseline) / baseline) * 100;
}

export type DeltaClassification = 'regression' | 'improvement' | 'stable';

export function classifyDelta(
  delta: number,
  lowerIsBetter = true,
): DeltaClassification {
  if (Math.abs(delta) < 10) return 'stable';
  if (lowerIsBetter) {
    return delta >= 10 ? 'regression' : 'improvement';
  }
  return delta >= 10 ? 'improvement' : 'regression';
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatFee(fee: number): string {
  return `${Math.round(fee).toLocaleString()} stroops`;
}

export function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

// ---------------------------------------------------------------------------
// Aggregate (builds everything in one pass)
// ---------------------------------------------------------------------------

export function buildAggregateMetrics(runs: FuzzingRun[]): RunAggregateMetrics {
  const statusCounts = countByStatus(runs);
  const severityCounts = countBySeverity(runs);
  const totalRuns = runs.length;

  let totalDuration = 0;
  let totalSeeds = 0;
  let totalCpu = 0;
  let totalMemory = 0;
  let totalFee = 0;
  let peakCpu = 0;
  let peakMemory = 0;
  let peakFee = 0;
  let crashes = 0;

  for (const run of runs) {
    totalDuration += run.duration;
    totalSeeds += run.seedCount;
    totalCpu += run.cpuInstructions;
    totalMemory += run.memoryBytes;
    totalFee += run.minResourceFee;
    if (run.cpuInstructions > peakCpu) peakCpu = run.cpuInstructions;
    if (run.memoryBytes > peakMemory) peakMemory = run.memoryBytes;
    if (run.minResourceFee > peakFee) peakFee = run.minResourceFee;
    if (run.crashDetail !== null) crashes += 1;
  }

  return {
    totalRuns,
    statusCounts,
    severityCounts,
    avgDuration: totalRuns > 0 ? totalDuration / totalRuns : 0,
    avgSeeds: totalRuns > 0 ? totalSeeds / totalRuns : 0,
    avgCpu: totalRuns > 0 ? Math.round(totalCpu / totalRuns) : 0,
    avgMemory: totalRuns > 0 ? Math.round(totalMemory / totalRuns) : 0,
    avgFee: totalRuns > 0 ? Math.round(totalFee / totalRuns) : 0,
    maxCpu: peakCpu,
    maxMemory: peakMemory,
    maxFee: peakFee,
    failureRate: totalRuns > 0 ? (statusCounts.failed / totalRuns) * 100 : 0,
    successRate: totalRuns > 0 ? (statusCounts.completed / totalRuns) * 100 : 0,
    criticalCount: severityCounts.critical,
    totalCrashes: crashes,
  };
}
