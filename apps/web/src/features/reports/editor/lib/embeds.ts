/**
 * Evidence embed resolution.
 *
 * `EntityResolver` is the seam between the editor and the rest of CrashLab.
 * The default implementation is an in-memory store seeded with representative
 * entities; a production adapter can implement the same interface against the
 * runs/crashes/traces/logs APIs without changing any UI code.
 */
import { isSafeReportUrl } from './sanitize';
import { stableStringify } from './serialization';
import type { EntitySnapshot, EntityType, EvidenceRef, ReportDocument } from './types';

export interface EntityResolver {
  resolve(reference: { type: EntityType; entityId: string }): Promise<EntitySnapshot | null>;
}

const SEED_ENTITIES: EntitySnapshot[] = [
  {
    id: 'run-001',
    type: 'run',
    title: 'Overflow repro run #001',
    status: 'failed',
    timestamp: '2026-11-21T10:00:00Z',
    sourceUrl: '/runs/run-001',
    summary: 'Arithmetic overflow reproduced with seed 0x2f.',
    fields: { seed: '0x2f', durationMs: 812 },
  },
  {
    id: 'crash-017',
    type: 'crash',
    title: 'HostError 0x01 — arithmetic overflow',
    status: 'triaged',
    timestamp: '2026-11-21T10:05:00Z',
    sourceUrl: '/crashes/crash-017',
    summary: 'Signature matches three previous runs on protocol 22.',
    fields: { code: '0x01', cluster: 'overflow-22' },
  },
  {
    id: 'trace-9a4',
    type: 'trace',
    title: 'invoke(host_fn) trace',
    status: 'complete',
    timestamp: '2026-11-21T10:06:00Z',
    sourceUrl: '/traces/trace-9a4',
    summary: 'Last span before failure is div_i64.',
  },
  {
    id: 'log-5521',
    type: 'log',
    title: 'RPC error log excerpt',
    status: 'archived',
    timestamp: '2026-11-21T10:07:00Z',
    sourceUrl: '/logs/log-5521',
    summary: 'Repeated HostError with matching request id.',
  },
  {
    id: 'diff-204',
    type: 'state-diff',
    title: 'Ledger state diff at failure',
    status: 'captured',
    timestamp: '2026-11-21T10:08:00Z',
    sourceUrl: '/state/diffs/diff-204',
    summary: 'Counter entry changed from 7 to 0 before panic.',
  },
  {
    id: 'chart-88',
    type: 'chart',
    title: 'Failure rate by seed',
    status: 'ready',
    timestamp: '2026-11-21T10:09:00Z',
    sourceUrl: '/charts/chart-88',
    summary: 'Failures cluster between seeds 0x20 and 0x40.',
  },
  {
    id: 'artifact-771',
    type: 'artifact',
    title: 'Replay bundle artifact',
    status: 'stored',
    timestamp: '2026-11-21T10:10:00Z',
    sourceUrl: '/artifacts/artifact-771',
    summary: 'Deterministic replay bundle for run-001.',
  },
];

function keyFor(type: EntityType, entityId: string): string {
  return `${type}:${entityId}`;
}

export class MockEntityResolver implements EntityResolver {
  private readonly entities = new Map<string, EntitySnapshot>();

  constructor(seed: EntitySnapshot[] = SEED_ENTITIES) {
    for (const entity of seed) this.upsert(entity);
  }

  upsert(snapshot: EntitySnapshot): void {
    this.entities.set(keyFor(snapshot.type, snapshot.id), snapshot);
  }

  resolve(reference: { type: EntityType; entityId: string }): Promise<EntitySnapshot | null> {
    return Promise.resolve(this.entities.get(keyFor(reference.type, reference.entityId)) ?? null);
  }
}

/** Default store-backed resolver used by the editor when none is injected. */
export const mockEntityResolver = new MockEntityResolver();

export function createEvidenceRef(
  type: EntityType,
  entityId: string,
  options: { id?: string; label?: string } = {},
): EvidenceRef {
  return {
    id: options.id ?? `evidence-${type}-${entityId}`,
    type,
    entityId,
    mode: 'live',
    ...(options.label ? { label: options.label } : {}),
  };
}

/** Capture the current entity state into an immutable pinned reference. */
export function pinEvidence(ref: EvidenceRef, snapshot: EntitySnapshot): EvidenceRef {
  if (keyFor(ref.type, ref.entityId) !== keyFor(snapshot.type, snapshot.id)) {
    throw new Error('Snapshot does not match the evidence reference');
  }
  return {
    ...ref,
    mode: 'pinned',
    snapshot: JSON.parse(stableStringify(snapshot)) as EntitySnapshot,
  };
}

export function unpinEvidence(ref: EvidenceRef): EvidenceRef {
  const { snapshot: _snapshot, ...rest } = ref;
  return { ...rest, mode: 'live' };
}

export async function resolveEvidence(
  ref: EvidenceRef,
  resolver: EntityResolver = mockEntityResolver,
): Promise<EntitySnapshot | null> {
  if (ref.mode === 'pinned') return ref.snapshot ?? null;
  return resolver.resolve({ type: ref.type, entityId: ref.entityId });
}

export async function resolveAllEvidence(
  document: ReportDocument,
  resolver: EntityResolver = mockEntityResolver,
): Promise<Record<string, EntitySnapshot | null>> {
  const entries = await Promise.all(
    Object.values(document.embeds).map(async (ref) => [ref.id, await resolveEvidence(ref, resolver)] as const),
  );
  return Object.fromEntries(entries);
}

/** A card's source link must never point at an unsafe protocol. */
export function evidenceSourceUrl(snapshot: EntitySnapshot): string | null {
  return isSafeReportUrl(snapshot.sourceUrl) ? snapshot.sourceUrl : null;
}
