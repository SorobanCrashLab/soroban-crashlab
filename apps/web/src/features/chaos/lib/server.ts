/**
 * Server-only chaos control plane (#2340).
 *
 * - `ChaosExecutor` is the seam to real fault injection (proxy rules, runner
 *   agents, RPC shims). The default executor is *simulated*: it records what
 *   it would inject and never touches traffic, which is the only safe default
 *   for a dashboard that ships to every environment.
 * - Running experiments are advanced lazily on every read/control call, so
 *   halt rules fire and durations complete without a background worker.
 * - Abort always calls `revoke`, even when the record is already terminal, so
 *   a retried emergency stop reaches the executor again (reliable signaling).
 * - Every save and control action lands in the experiment's own event log and
 *   the append-only audit log (#1431).
 */

import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { recordAuditEvent } from '@/lib/audit';
import { describePrincipal } from '@/lib/rbac';
import { advance, type Actor, type ChaosRole } from './lifecycle';
import { definitionFingerprint, type ExperimentDefinition, type ExperimentRecord } from './model';
import { modelTelemetry, type ChaosTelemetrySource, type TelemetrySample } from './monitor';
import { EXPERIMENT_TEMPLATES } from './templates';

export interface ChaosExecutor {
  readonly mode: 'simulated' | 'live';
  inject(record: ExperimentRecord): { ok: boolean; detail: string };
  revoke(record: ExperimentRecord): { ok: boolean; detail: string };
}

export function createSimulatedExecutor(): ChaosExecutor & { log: string[] } {
  const log: string[] = [];
  return {
    mode: 'simulated',
    log,
    inject(record) {
      log.push(`inject ${record.id}`);
      return { ok: true, detail: 'Simulated: faults recorded, no traffic altered.' };
    },
    revoke(record) {
      log.push(`revoke ${record.id}`);
      return { ok: true, detail: 'Simulated: faults revoked.' };
    },
  };
}

export async function chaosActor(request: NextRequest): Promise<Actor> {
  const { principal, role } = await describePrincipal(request);
  const chaosRole: ChaosRole = !principal.authenticated ? 'anonymous' : role === 'maintainer' ? 'maintainer' : 'analyst';
  return { subject: principal.subject, role: chaosRole };
}

function seed(now: number): ExperimentRecord[] {
  const make = (id: string, templateIndex: number, startedMinutesAgo: number | null, extra: Partial<ExperimentRecord> = {}): ExperimentRecord => {
    const definition = EXPERIMENT_TEMPLATES[templateIndex].definition;
    const createdAt = new Date(now - 3 * 86_400_000).toISOString();
    return {
      id,
      definition,
      version: 1,
      versions: [{ version: 1, fingerprint: definitionFingerprint(definition), savedAt: createdAt, savedBy: 'github:sre-bot' }],
      status: startedMinutesAgo === null ? 'draft' : 'running',
      createdBy: 'github:sre-bot',
      createdAt,
      approvals: startedMinutesAgo === null ? [] : [{ by: 'github:maintainer', at: createdAt, note: 'Seeded demo' }],
      startedAt: startedMinutesAgo === null ? null : new Date(now - startedMinutesAgo * 60_000).toISOString(),
      endedAt: null,
      endReason: null,
      haltedBy: null,
      events: [{ at: createdAt, actor: 'github:sre-bot', action: 'save', detail: 'Seeded demo experiment (simulated executor).' }],
      ...extra,
    };
  };
  return [
    // Halts on its SLO burn rule shortly after start.
    make('exp-demo-error-burst', 2, 120),
    // Runs to completion.
    make('exp-demo-cpu', 1, 90),
    make('exp-demo-rpc-latency', 0, null),
  ];
}

export class ChaosStore {
  private readonly records = new Map<string, ExperimentRecord>();
  readonly samples = new Map<string, TelemetrySample[]>();

  constructor(
    readonly executor: ChaosExecutor = createSimulatedExecutor(),
    readonly telemetry: ChaosTelemetrySource = modelTelemetry,
    private readonly clock: () => number = Date.now,
  ) {
    for (const record of seed(clock())) this.records.set(record.id, record);
  }

  now(): number {
    return this.clock();
  }

  /** Advance every running experiment; revoke faults for any that ended. */
  tick(): void {
    const now = this.clock();
    for (const [id, record] of this.records) {
      const result = advance(record, this.telemetry, now);
      this.samples.set(id, result.samples);
      if (result.changed) {
        this.executor.revoke(result.record);
        this.records.set(id, result.record);
        const last = result.record.events[result.record.events.length - 1];
        recordAuditEvent({ action: 'chaos.experiment.control', target: id, actor: 'system', metadata: { action: last.action, detail: last.detail } });
      }
    }
  }

  list(): ExperimentRecord[] {
    this.tick();
    return [...this.records.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  }

  get(id: string): ExperimentRecord | null {
    this.tick();
    return this.records.get(id) ?? null;
  }

  put(record: ExperimentRecord): void {
    this.records.set(record.id, record);
  }

  /** Create, or save a new version of a draft/rejected experiment. */
  save(definition: ExperimentDefinition, actor: Actor, id?: string): { ok: true; record: ExperimentRecord } | { ok: false; status: number; error: string } {
    const now = new Date(this.clock()).toISOString();
    const fingerprint = definitionFingerprint(definition);
    if (id) {
      const existing = this.get(id);
      if (!existing) return { ok: false, status: 404, error: 'Experiment not found' };
      if (existing.status !== 'draft' && existing.status !== 'rejected') {
        return { ok: false, status: 409, error: `A ${existing.status} experiment is locked; clone it to change the definition.` };
      }
      if (fingerprint === existing.versions[existing.versions.length - 1]?.fingerprint) return { ok: true, record: existing };
      const version = existing.version + 1;
      const record: ExperimentRecord = {
        ...existing,
        definition,
        version,
        versions: [...existing.versions, { version, fingerprint, savedAt: now, savedBy: actor.subject }],
        status: 'draft',
        approvals: [],
        events: [...existing.events, { at: now, actor: actor.subject, action: 'save', detail: `Saved v${version} (${fingerprint}).` }],
      };
      this.records.set(id, record);
      recordAuditEvent({ action: 'chaos.experiment.save', target: id, actor: actor.subject, metadata: { version, fingerprint } });
      return { ok: true, record };
    }
    const newId = `exp-${randomUUID().slice(0, 8)}`;
    const record: ExperimentRecord = {
      id: newId,
      definition,
      version: 1,
      versions: [{ version: 1, fingerprint, savedAt: now, savedBy: actor.subject }],
      status: 'draft',
      createdBy: actor.subject,
      createdAt: now,
      approvals: [],
      startedAt: null,
      endedAt: null,
      endReason: null,
      haltedBy: null,
      events: [{ at: now, actor: actor.subject, action: 'save', detail: `Created v1 (${fingerprint}).` }],
    };
    this.records.set(newId, record);
    recordAuditEvent({ action: 'chaos.experiment.save', target: newId, actor: actor.subject, metadata: { version: 1, fingerprint } });
    return { ok: true, record };
  }
}

let store: ChaosStore | null = null;
export function getChaosStore(): ChaosStore {
  store ??= new ChaosStore();
  return store;
}
export function resetChaosStore(next?: ChaosStore): void {
  store = next ?? null;
}

export function auditControl(actor: Actor, id: string, action: string, detail: Record<string, unknown>): void {
  recordAuditEvent({ action: 'chaos.experiment.control', target: id, actor: actor.subject, metadata: { action, ...detail } });
}
