/**
 * Dry-run impact estimation and preflight guardrails (#2340).
 *
 * Safety-first: any `fail` check blocks submission (approvals excepted) and
 * start. Checks are re-run at start time, because the world (running
 * experiments, maintenance windows) changes between approval and execution.
 */

import { findTarget, inMaintenanceWindow, MAINTENANCE_WINDOWS, TOTAL_CAPACITY_PER_HOUR, type InventoryTarget } from './inventory';
import type { Environment, ExperimentDefinition, ExperimentRecord, FaultSpec } from './model';

export interface ImpactEstimate {
  targets: Array<{ ref: string; label: string; environment: Environment | 'unknown'; throughputPerHour: number }>;
  dependents: string[];
  environments: Environment[];
  affectedPerHour: number;
  affectedDuringRun: number;
  blastRadiusPct: number;
  expectedErrorRateDelta: number;
  expectedLatencyDeltaMs: number;
  unknownTargets: string[];
}

export function faultErrorShare(fault: FaultSpec): number {
  switch (fault.type) {
    case 'error':
      return fault.errorRate;
    case 'drop':
      return fault.dropRate * 0.8;
    case 'throttle':
      return Math.min(0.5, 50 / fault.requestsPerSecond / 10);
    case 'memory-pressure':
      return Math.min(0.3, fault.memoryMb / 16_384 / 2);
    case 'cpu-pressure':
      return Math.max(0, (fault.cpuPercent - 70) / 300);
    case 'latency':
      return fault.latencyMs > 5_000 ? 0.15 : 0;
  }
}

export function faultLatencyMs(fault: FaultSpec): number {
  switch (fault.type) {
    case 'latency':
      return fault.latencyMs + fault.jitterMs / 2;
    case 'cpu-pressure':
      return fault.cpuPercent * 6;
    case 'throttle':
      return Math.min(5_000, 10_000 / fault.requestsPerSecond);
    case 'memory-pressure':
      return fault.memoryMb / 20;
    default:
      return 0;
  }
}

export function estimateImpact(definition: ExperimentDefinition): ImpactEstimate {
  const resolved: InventoryTarget[] = [];
  const unknownTargets: string[] = [];
  for (const ref of definition.targets) {
    const target = findTarget(ref);
    if (target) resolved.push(target);
    else unknownTargets.push(`${ref.kind}:${ref.id}`);
  }
  // Dependents ride along (a workspace fault reaches its campaigns and runners).
  const dependents = [...new Set(resolved.flatMap((target) => target.dependents))].filter(
    (ref) => !resolved.some((target) => `${target.kind}:${target.id}` === ref),
  );
  const dependentThroughput = dependents.reduce((sum, ref) => {
    const [kind, id] = ref.split(':');
    return sum + (findTarget({ kind: kind as InventoryTarget['kind'], id })?.throughputPerHour ?? 0);
  }, 0);
  const affectedPerHour = resolved.reduce((sum, target) => sum + target.throughputPerHour, 0) + dependentThroughput * 0.5;
  const errorShare = Math.min(1, definition.faults.reduce((sum, fault) => sum + faultErrorShare(fault), 0));
  return {
    targets: resolved.map((target) => ({
      ref: `${target.kind}:${target.id}`,
      label: target.label,
      environment: target.environment,
      throughputPerHour: target.throughputPerHour,
    })),
    dependents,
    environments: [...new Set(resolved.map((target) => target.environment))].sort(),
    affectedPerHour: Math.round(affectedPerHour),
    affectedDuringRun: Math.round((affectedPerHour * definition.durationSec) / 3_600),
    blastRadiusPct: Math.round((affectedPerHour / TOTAL_CAPACITY_PER_HOUR) * 1_000) / 10,
    expectedErrorRateDelta: Math.round(errorShare * 1_000) / 1_000,
    expectedLatencyDeltaMs: Math.round(definition.faults.reduce((sum, fault) => sum + faultLatencyMs(fault), 0)),
    unknownTargets,
  };
}

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface PreflightCheck {
  id: 'targets' | 'environment' | 'blast-radius' | 'concurrency' | 'overlap' | 'maintenance-window' | 'halt-rules' | 'approvals' | 'duration' | 'schedule';
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface PreflightContext {
  now: number;
  /** Other experiments, used for overlap/concurrency checks. */
  others: readonly Pick<ExperimentRecord, 'id' | 'status' | 'definition'>[];
  approvals: number;
  selfId?: string;
}

export interface PreflightResult {
  checks: PreflightCheck[];
  /** No failing check other than approvals. */
  readyToSubmit: boolean;
  /** No failing check at all. */
  readyToStart: boolean;
  impact: ImpactEstimate;
}

export function preflight(definition: ExperimentDefinition, context: PreflightContext): PreflightResult {
  const impact = estimateImpact(definition);
  const { guardrails } = definition;
  const checks: PreflightCheck[] = [];

  checks.push(
    impact.unknownTargets.length > 0
      ? { id: 'targets', label: 'Targets resolved', status: 'fail', detail: `Unknown targets: ${impact.unknownTargets.join(', ')}.` }
      : { id: 'targets', label: 'Targets resolved', status: 'pass', detail: `${impact.targets.length} target(s); ${impact.dependents.length} dependent(s).` },
  );

  const disallowed = impact.environments.filter((environment) => !guardrails.environmentAllowlist.includes(environment));
  checks.push(
    disallowed.length > 0
      ? { id: 'environment', label: 'Environment allowlist', status: 'fail', detail: `${disallowed.join(', ')} not in allowlist (${guardrails.environmentAllowlist.join(', ')}).` }
      : { id: 'environment', label: 'Environment allowlist', status: impact.environments.includes('prod') ? 'warn' : 'pass', detail: `Environments: ${impact.environments.join(', ') || 'none'}.` },
  );

  checks.push(
    impact.blastRadiusPct > guardrails.maxBlastRadiusPct
      ? { id: 'blast-radius', label: 'Blast radius', status: 'fail', detail: `${impact.blastRadiusPct}% of capacity exceeds the ${guardrails.maxBlastRadiusPct}% limit.` }
      : { id: 'blast-radius', label: 'Blast radius', status: 'pass', detail: `${impact.blastRadiusPct}% of capacity (limit ${guardrails.maxBlastRadiusPct}%); ≈${impact.affectedDuringRun} runs affected.` },
  );

  const targetCount = impact.targets.length + impact.dependents.length;
  checks.push(
    targetCount > guardrails.maxConcurrentTargets
      ? { id: 'concurrency', label: 'Concurrent targets', status: 'fail', detail: `${targetCount} targets incl. dependents exceeds ${guardrails.maxConcurrentTargets}.` }
      : { id: 'concurrency', label: 'Concurrent targets', status: 'pass', detail: `${targetCount} of ${guardrails.maxConcurrentTargets} allowed.` },
  );

  const mine = new Set([...impact.targets.map((target) => target.ref), ...impact.dependents]);
  const overlapping = context.others.filter(
    (other) =>
      other.id !== context.selfId &&
      other.status === 'running' &&
      [...estimateImpact(other.definition).targets.map((target) => target.ref), ...estimateImpact(other.definition).dependents].some((ref) => mine.has(ref)),
  );
  checks.push(
    overlapping.length > 0
      ? { id: 'overlap', label: 'No overlapping experiments', status: 'fail', detail: `Overlaps running: ${overlapping.map((other) => other.definition.name).join(', ')}.` }
      : { id: 'overlap', label: 'No overlapping experiments', status: 'pass', detail: 'No running experiment touches these targets.' },
  );

  if (guardrails.maintenanceWindowOnly) {
    const closed = impact.environments.filter((environment) => !inMaintenanceWindow(environment, context.now));
    checks.push(
      closed.length > 0
        ? {
            id: 'maintenance-window',
            label: 'Maintenance window',
            status: 'fail',
            detail: `Outside window for ${closed.join(', ')} (${MAINTENANCE_WINDOWS.filter((window) => closed.includes(window.environment)).map((window) => window.label).join('; ')}).`,
          }
        : { id: 'maintenance-window', label: 'Maintenance window', status: 'pass', detail: 'Inside the maintenance window.' },
    );
  } else {
    checks.push({
      id: 'maintenance-window',
      label: 'Maintenance window',
      status: impact.environments.some((environment) => environment !== 'dev') ? 'warn' : 'pass',
      detail: 'Not restricted to maintenance windows.',
    });
  }

  checks.push(
    definition.haltRules.some((rule) => rule.metric === 'error_rate' || rule.metric === 'slo_burn_rate' || rule.metric === 'incident_opened')
      ? { id: 'halt-rules', label: 'Automatic halt rules', status: 'pass', detail: `${definition.haltRules.length} rule(s), including an error/SLO trigger.` }
      : { id: 'halt-rules', label: 'Automatic halt rules', status: 'warn', detail: 'No error-rate, SLO or incident halt rule; add one for safety.' },
  );

  const required = Math.max(guardrails.requiredApprovals, impact.environments.includes('prod') ? 2 : 0);
  checks.push(
    context.approvals >= required
      ? { id: 'approvals', label: 'Approvals', status: 'pass', detail: `${context.approvals} of ${required} required.` }
      : { id: 'approvals', label: 'Approvals', status: 'fail', detail: `${context.approvals} of ${required} required${impact.environments.includes('prod') ? ' (prod always needs 2)' : ''}.` },
  );

  checks.push(
    impact.environments.includes('prod') && definition.durationSec > 900
      ? { id: 'duration', label: 'Duration', status: 'fail', detail: 'Production experiments are capped at 15 minutes.' }
      : { id: 'duration', label: 'Duration', status: 'pass', detail: `${definition.durationSec} s.` },
  );

  if (definition.scheduledAt) {
    const at = Date.parse(definition.scheduledAt);
    checks.push(
      at < context.now
        ? { id: 'schedule', label: 'Schedule', status: 'warn', detail: 'Scheduled time has passed; start manually.' }
        : { id: 'schedule', label: 'Schedule', status: 'pass', detail: `Scheduled for ${definition.scheduledAt}.` },
    );
  }

  const blocking = checks.filter((check) => check.status === 'fail');
  return {
    checks,
    readyToSubmit: blocking.every((check) => check.id === 'approvals' || check.id === 'maintenance-window'),
    readyToStart: blocking.length === 0,
    impact,
  };
}

export function requiredApprovals(definition: ExperimentDefinition): number {
  return Math.max(definition.guardrails.requiredApprovals, estimateImpact(definition).environments.includes('prod') ? 2 : 0);
}
