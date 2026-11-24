/**
 * Chaos experiment model (#2340).
 *
 * An experiment *definition* is deterministic data: canonical serialization
 * gives every saved version a stable fingerprint, so a report always names
 * exactly what ran. The zod schema is the single validation boundary for
 * the designer, the dry run and the API.
 */

import { z } from 'zod';

export const ENVIRONMENTS = ['dev', 'staging', 'prod'] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export const TARGET_KINDS = ['workspace', 'campaign', 'runner', 'integration'] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

export const FAULT_TYPES = ['latency', 'error', 'drop', 'throttle', 'cpu-pressure', 'memory-pressure'] as const;
export type FaultType = (typeof FAULT_TYPES)[number];

export const HALT_METRICS = ['error_rate', 'p95_latency_ms', 'slo_burn_rate', 'data_quality_score', 'incident_opened'] as const;
export type HaltMetric = (typeof HALT_METRICS)[number];

export const faultSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('latency'),
      latencyMs: z.number().int().min(1).max(30_000),
      jitterMs: z.number().int().min(0).max(30_000).default(0),
    })
    .strict(),
  z
    .object({ type: z.literal('error'), errorRate: z.number().gt(0).max(1), statusCode: z.number().int().min(400).max(599).default(503) })
    .strict(),
  z.object({ type: z.literal('drop'), dropRate: z.number().gt(0).max(1) }).strict(),
  z.object({ type: z.literal('throttle'), requestsPerSecond: z.number().int().min(1).max(10_000) }).strict(),
  z.object({ type: z.literal('cpu-pressure'), cpuPercent: z.number().int().min(1).max(95) }).strict(),
  z.object({ type: z.literal('memory-pressure'), memoryMb: z.number().int().min(16).max(16_384) }).strict(),
]);

export type FaultSpec = z.infer<typeof faultSchema>;

export const targetSchema = z.object({ kind: z.enum(TARGET_KINDS), id: z.string().min(1).max(80) }).strict();
export type TargetRef = z.infer<typeof targetSchema>;

export const haltRuleSchema = z
  .object({
    metric: z.enum(HALT_METRICS),
    comparator: z.enum(['gt', 'lt']),
    threshold: z.number().finite(),
    /** Consecutive breaching samples before the rule fires (debounce). */
    forSamples: z.number().int().min(1).max(10).default(2),
  })
  .strict();
export type HaltRule = z.infer<typeof haltRuleSchema>;

export const guardrailsSchema = z
  .object({
    maxBlastRadiusPct: z.number().min(0.1).max(100),
    maxConcurrentTargets: z.number().int().min(1).max(20),
    environmentAllowlist: z.array(z.enum(ENVIRONMENTS)).min(1),
    maintenanceWindowOnly: z.boolean(),
    requiredApprovals: z.number().int().min(0).max(3),
  })
  .strict();
export type Guardrails = z.infer<typeof guardrailsSchema>;

export const definitionSchema = z
  .object({
    name: z.string().trim().min(3).max(80),
    hypothesis: z.string().trim().min(10, 'State what you expect to hold (10+ characters).').max(500),
    targets: z.array(targetSchema).min(1).max(20),
    faults: z.array(faultSchema).min(1).max(4),
    durationSec: z.number().int().min(30).max(3_600),
    scheduledAt: z.string().nullable().default(null),
    guardrails: guardrailsSchema,
    haltRules: z.array(haltRuleSchema).min(1, 'At least one automatic halt rule is required.').max(8),
    tags: z.array(z.string().max(30)).max(10).default([]),
  })
  .strict();

export type ExperimentDefinition = z.infer<typeof definitionSchema>;

export type ExperimentStatus = 'draft' | 'pending-approval' | 'approved' | 'running' | 'completed' | 'aborted' | 'halted' | 'rejected';

export const TERMINAL_STATUSES: readonly ExperimentStatus[] = ['completed', 'aborted', 'halted'];

export interface ExperimentVersion {
  version: number;
  fingerprint: string;
  savedAt: string;
  savedBy: string;
}

export interface ExperimentEvent {
  at: string;
  actor: string;
  action: string;
  detail: string;
}

export interface ExperimentRecord {
  id: string;
  definition: ExperimentDefinition;
  version: number;
  versions: ExperimentVersion[];
  status: ExperimentStatus;
  createdBy: string;
  createdAt: string;
  approvals: Array<{ by: string; at: string; note: string }>;
  startedAt: string | null;
  endedAt: string | null;
  endReason: string | null;
  /** Halt rule that fired, when status is `halted`. */
  haltedBy: HaltRule | null;
  events: ExperimentEvent[];
}

export type DefinitionParse = { ok: true; definition: ExperimentDefinition } | { ok: false; errors: string[] };

export function parseDefinition(input: unknown): DefinitionParse {
  const parsed = definitionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'definition'}: ${issue.message}`) };
  }
  const definition = parsed.data;
  const errors: string[] = [];
  const keys = definition.targets.map((target) => `${target.kind}:${target.id}`);
  if (new Set(keys).size !== keys.length) errors.push('targets: each target may appear only once.');
  const faultTypes = definition.faults.map((fault) => fault.type);
  if (new Set(faultTypes).size !== faultTypes.length) errors.push('faults: each fault type may appear only once.');
  if (definition.scheduledAt && !Number.isFinite(Date.parse(definition.scheduledAt))) errors.push('scheduledAt: must be an ISO timestamp.');
  for (const fault of definition.faults) {
    if (fault.type === 'latency' && fault.jitterMs > fault.latencyMs) errors.push('faults.latency.jitterMs: jitter cannot exceed the injected latency.');
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, definition };
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, stable((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** Canonical JSON: sorted keys; targets/allowlist/tags sorted (set semantics). */
export function canonicalDefinition(definition: ExperimentDefinition): string {
  return JSON.stringify(
    stable({
      ...definition,
      targets: [...definition.targets].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)),
      faults: [...definition.faults].sort((a, b) => a.type.localeCompare(b.type)),
      guardrails: { ...definition.guardrails, environmentAllowlist: [...new Set(definition.guardrails.environmentAllowlist)].sort() },
      tags: [...new Set(definition.tags)].sort(),
    }),
  );
}

export function definitionFingerprint(definition: ExperimentDefinition): string {
  const text = canonicalDefinition(definition);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ code, 0x811c9dc5) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export function describeFault(fault: FaultSpec): string {
  switch (fault.type) {
    case 'latency':
      return `+${fault.latencyMs} ms latency${fault.jitterMs ? ` (±${fault.jitterMs} ms)` : ''}`;
    case 'error':
      return `${Math.round(fault.errorRate * 100)}% ${fault.statusCode} errors`;
    case 'drop':
      return `${Math.round(fault.dropRate * 100)}% dropped requests`;
    case 'throttle':
      return `throttle to ${fault.requestsPerSecond} req/s`;
    case 'cpu-pressure':
      return `${fault.cpuPercent}% CPU pressure`;
    case 'memory-pressure':
      return `${fault.memoryMb} MB memory pressure`;
  }
}

export function describeHaltRule(rule: HaltRule): string {
  const metric = rule.metric.replace(/_/g, ' ');
  return rule.metric === 'incident_opened'
    ? `an incident opens (${rule.forSamples} sample${rule.forSamples === 1 ? '' : 's'})`
    : `${metric} ${rule.comparator === 'gt' ? '>' : '<'} ${rule.threshold} for ${rule.forSamples} sample${rule.forSamples === 1 ? '' : 's'}`;
}
