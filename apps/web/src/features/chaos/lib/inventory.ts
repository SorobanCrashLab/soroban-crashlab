/**
 * Chaos target inventory and maintenance windows (#2340).
 *
 * Deterministic stand-in for the workspace/campaign/runner/integration
 * registry: each target carries its environment, throughput (for blast
 * radius) and dependents (for impact estimation). The shape is what a real
 * registry adapter must return.
 */

import type { Environment, TargetKind, TargetRef } from './model';

export interface InventoryTarget {
  kind: TargetKind;
  id: string;
  label: string;
  environment: Environment;
  /** Runs (or calls, for integrations) per hour at baseline. */
  throughputPerHour: number;
  /** Other targets whose traffic flows through this one. */
  dependents: string[];
  baseline: { errorRate: number; p95LatencyMs: number; cpuPct: number; dataQuality: number };
}

export const INVENTORY: readonly InventoryTarget[] = [
  { kind: 'workspace', id: 'ws-sandbox', label: 'Sandbox workspace', environment: 'dev', throughputPerHour: 120, dependents: ['campaign:camp-auth-2026', 'runner:runner-dev-1'], baseline: { errorRate: 0.01, p95LatencyMs: 180, cpuPct: 30, dataQuality: 0.99 } },
  { kind: 'workspace', id: 'ws-core', label: 'Core fuzzing workspace', environment: 'prod', throughputPerHour: 2_400, dependents: ['campaign:camp-token-fuzz', 'runner:runner-prod-1', 'runner:runner-prod-2'], baseline: { errorRate: 0.004, p95LatencyMs: 240, cpuPct: 45, dataQuality: 0.995 } },
  { kind: 'campaign', id: 'camp-auth-2026', label: 'Auth matrix campaign', environment: 'dev', throughputPerHour: 60, dependents: [], baseline: { errorRate: 0.012, p95LatencyMs: 210, cpuPct: 28, dataQuality: 0.99 } },
  { kind: 'campaign', id: 'camp-token-fuzz', label: 'Token fuzz (nightly)', environment: 'prod', throughputPerHour: 900, dependents: [], baseline: { errorRate: 0.006, p95LatencyMs: 260, cpuPct: 50, dataQuality: 0.995 } },
  { kind: 'campaign', id: 'camp-replay-regression', label: 'Replay regression', environment: 'staging', throughputPerHour: 300, dependents: [], baseline: { errorRate: 0.008, p95LatencyMs: 230, cpuPct: 40, dataQuality: 0.99 } },
  { kind: 'runner', id: 'runner-dev-1', label: 'Dev runner 1', environment: 'dev', throughputPerHour: 80, dependents: [], baseline: { errorRate: 0.01, p95LatencyMs: 190, cpuPct: 35, dataQuality: 0.99 } },
  { kind: 'runner', id: 'runner-staging-1', label: 'Staging runner 1', environment: 'staging', throughputPerHour: 400, dependents: [], baseline: { errorRate: 0.007, p95LatencyMs: 220, cpuPct: 42, dataQuality: 0.992 } },
  { kind: 'runner', id: 'runner-prod-1', label: 'Prod runner 1', environment: 'prod', throughputPerHour: 1_100, dependents: [], baseline: { errorRate: 0.004, p95LatencyMs: 250, cpuPct: 55, dataQuality: 0.995 } },
  { kind: 'runner', id: 'runner-prod-2', label: 'Prod runner 2', environment: 'prod', throughputPerHour: 1_100, dependents: [], baseline: { errorRate: 0.004, p95LatencyMs: 250, cpuPct: 55, dataQuality: 0.995 } },
  { kind: 'integration', id: 'soroban-rpc-testnet', label: 'Soroban RPC (testnet)', environment: 'staging', throughputPerHour: 5_000, dependents: ['campaign:camp-replay-regression', 'runner:runner-staging-1'], baseline: { errorRate: 0.01, p95LatencyMs: 320, cpuPct: 20, dataQuality: 0.99 } },
  { kind: 'integration', id: 'github-webhooks', label: 'GitHub webhooks', environment: 'prod', throughputPerHour: 600, dependents: [], baseline: { errorRate: 0.002, p95LatencyMs: 150, cpuPct: 10, dataQuality: 1 } },
];

export const TOTAL_CAPACITY_PER_HOUR = INVENTORY.reduce((sum, target) => sum + target.throughputPerHour, 0);

export function findTarget(ref: TargetRef): InventoryTarget | null {
  return INVENTORY.find((target) => target.kind === ref.kind && target.id === ref.id) ?? null;
}

export interface MaintenanceWindow {
  environment: Environment;
  /** 0 = Sunday … 6 = Saturday (UTC). */
  days: number[];
  startHourUtc: number;
  endHourUtc: number;
  label: string;
}

export const MAINTENANCE_WINDOWS: readonly MaintenanceWindow[] = [
  { environment: 'dev', days: [0, 1, 2, 3, 4, 5, 6], startHourUtc: 0, endHourUtc: 24, label: 'Dev: any time' },
  { environment: 'staging', days: [1, 2, 3, 4, 5], startHourUtc: 8, endHourUtc: 20, label: 'Staging: weekdays 08:00–20:00 UTC' },
  { environment: 'prod', days: [2, 4], startHourUtc: 14, endHourUtc: 16, label: 'Prod: Tue & Thu 14:00–16:00 UTC' },
];

export function inMaintenanceWindow(environment: Environment, at: number): boolean {
  const date = new Date(at);
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60;
  return MAINTENANCE_WINDOWS.some(
    (window) => window.environment === environment && window.days.includes(date.getUTCDay()) && hour >= window.startHourUtc && hour < window.endHourUtc,
  );
}
