/**
 * Retention, holds and deletion governance (#2342).
 *
 * Safety rules enforced here (and re-checked at decision time on the
 * server, because holds can be placed between request and approval):
 *  - an artifact under any active hold is never eligible for deletion;
 *  - the newest `keepMinimum` artifacts per (type, campaign) are always kept;
 *  - deletion needs a second person: requester ≠ approver, approver is a
 *    maintainer;
 *  - releasing a legal hold needs a written justification.
 *
 * Every function is pure and takes `now`, so dry-runs are reproducible.
 */

import { z } from 'zod';
import {
  ARTIFACT_TYPES,
  type ArtifactType,
  type DeletionRequest,
  type LegalHold,
  type ManagedArtifact,
  type RetentionPolicy,
} from './model';

const DAY = 86_400_000;

export const DEFAULT_POLICIES: RetentionPolicy[] = ARTIFACT_TYPES.map((artifactType) => ({
  artifactType,
  maxAgeDays: { bundle: 180, log: 30, corpus: 365, report: 730, reproducer: 730, trace: 90 }[artifactType],
  action: artifactType === 'corpus' || artifactType === 'report' ? 'archive' : 'delete',
  keepMinimum: artifactType === 'reproducer' ? 5 : 2,
  enabled: true,
  updatedAt: '2026-11-01T00:00:00.000Z',
  updatedBy: 'system',
}));

export const policyUpdateSchema = z
  .object({
    artifactType: z.enum(ARTIFACT_TYPES),
    maxAgeDays: z.number().int().min(1).max(3650),
    action: z.enum(['delete', 'archive']),
    keepMinimum: z.number().int().min(0).max(100),
    enabled: z.boolean(),
  })
  .strict();

export type PolicyUpdate = z.infer<typeof policyUpdateSchema>;

export function isHoldActive(hold: LegalHold, now: number): boolean {
  if (hold.releasedAt) return false;
  if (hold.expiresAt && Date.parse(hold.expiresAt) <= now) return false;
  return true;
}

export function holdCovers(hold: LegalHold, artifact: Pick<ManagedArtifact, 'id' | 'campaignId' | 'runId'>): boolean {
  const scope = hold.scope;
  if (scope.artifactIds?.includes(artifact.id)) return true;
  if (scope.campaignId && artifact.campaignId === scope.campaignId) return true;
  if (scope.runId && artifact.runId === scope.runId) return true;
  return false;
}

export function activeHoldsFor(
  artifact: Pick<ManagedArtifact, 'id' | 'campaignId' | 'runId'>,
  holds: readonly LegalHold[],
  now: number,
): LegalHold[] {
  return holds.filter((hold) => isHoldActive(hold, now) && holdCovers(hold, artifact));
}

export interface RetentionCandidate {
  artifactId: string;
  name: string;
  artifactType: ArtifactType;
  ageDays: number;
  sizeBytes: number;
  action: RetentionPolicy['action'];
}

export interface RetentionSimulation {
  generatedAt: string;
  eligible: RetentionCandidate[];
  protectedByHold: Array<RetentionCandidate & { holdIds: string[] }>;
  keptByMinimum: RetentionCandidate[];
  bytesReclaimable: number;
  byType: Record<string, { eligible: number; bytes: number }>;
}

export function simulateRetention(
  artifacts: readonly ManagedArtifact[],
  policies: readonly RetentionPolicy[],
  holds: readonly LegalHold[],
  now: number,
): RetentionSimulation {
  const policyFor = new Map(policies.map((policy) => [policy.artifactType, policy]));
  const result: RetentionSimulation = {
    generatedAt: new Date(now).toISOString(),
    eligible: [],
    protectedByHold: [],
    keptByMinimum: [],
    bytesReclaimable: 0,
    byType: {},
  };

  // Rank newest-first inside each (class, campaign) for keepMinimum.
  const groups = new Map<string, ManagedArtifact[]>();
  for (const artifact of artifacts) {
    const key = `${artifact.retentionClass}\u0000${artifact.campaignId ?? ''}`;
    const group = groups.get(key) ?? [];
    group.push(artifact);
    groups.set(key, group);
  }
  const rank = new Map<string, number>();
  for (const group of groups.values()) {
    group
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id))
      .forEach((artifact, index) => rank.set(artifact.id, index));
  }

  const ordered = [...artifacts].sort((a, b) => a.id.localeCompare(b.id));
  for (const artifact of ordered) {
    const policy = policyFor.get(artifact.retentionClass);
    if (!policy || !policy.enabled) continue;
    const ageDays = Math.floor((now - Date.parse(artifact.createdAt)) / DAY);
    if (ageDays < policy.maxAgeDays) continue;
    const candidate: RetentionCandidate = {
      artifactId: artifact.id,
      name: artifact.name,
      artifactType: artifact.retentionClass,
      ageDays,
      sizeBytes: artifact.sizeBytes,
      action: policy.action,
    };
    const covering = activeHoldsFor(artifact, holds, now);
    if (covering.length > 0) {
      result.protectedByHold.push({ ...candidate, holdIds: covering.map((hold) => hold.id) });
      continue;
    }
    if ((rank.get(artifact.id) ?? 0) < policy.keepMinimum) {
      result.keptByMinimum.push(candidate);
      continue;
    }
    result.eligible.push(candidate);
    result.bytesReclaimable += artifact.sizeBytes;
    const bucket = result.byType[artifact.retentionClass] ?? { eligible: 0, bytes: 0 };
    bucket.eligible += 1;
    bucket.bytes += artifact.sizeBytes;
    result.byType[artifact.retentionClass] = bucket;
  }
  return result;
}

// ─── holds ──────────────────────────────────────────────────────────────────

export const holdCreateSchema = z
  .object({
    name: z.string().trim().min(3).max(80),
    kind: z.enum(['legal', 'compliance', 'investigation']),
    reason: z.string().trim().min(10, 'Explain why the hold is needed (10+ characters).').max(500),
    scope: z
      .object({
        artifactIds: z.array(z.string().max(80)).max(500).optional(),
        campaignId: z.string().max(80).optional(),
        runId: z.string().max(80).optional(),
      })
      .strict()
      .refine(
        (scope) => Boolean(scope.artifactIds?.length || scope.campaignId || scope.runId),
        'A hold must cover at least one artifact, campaign or run.',
      ),
    expiresAt: z.string().nullable().optional(),
  })
  .strict();

export type HoldCreate = z.infer<typeof holdCreateSchema>;

export type GovernanceResult<T> = { ok: true; value: T } | { ok: false; error: string; status: number };

export function createHold(input: HoldCreate, actor: string, now: number, id: string): GovernanceResult<LegalHold> {
  if (input.expiresAt) {
    const expires = Date.parse(input.expiresAt);
    if (!Number.isFinite(expires)) return { ok: false, error: 'expiresAt must be an ISO date.', status: 422 };
    if (expires <= now) return { ok: false, error: 'A hold cannot expire in the past.', status: 422 };
    if (input.kind === 'legal') {
      return { ok: false, error: 'Legal holds do not expire; release them explicitly.', status: 422 };
    }
  }
  return {
    ok: true,
    value: {
      id,
      name: input.name,
      kind: input.kind,
      reason: input.reason,
      scope: input.scope,
      createdBy: actor,
      createdAt: new Date(now).toISOString(),
      expiresAt: input.expiresAt ?? null,
      releasedAt: null,
      releasedBy: null,
      releaseJustification: null,
    },
  };
}

export const LEGAL_RELEASE_MIN_JUSTIFICATION = 20;

export function releaseHold(
  hold: LegalHold,
  actor: string,
  justification: string,
  now: number,
): GovernanceResult<LegalHold> {
  if (hold.releasedAt) return { ok: false, error: 'Hold is already released.', status: 409 };
  const text = justification.trim();
  const minimum = hold.kind === 'legal' ? LEGAL_RELEASE_MIN_JUSTIFICATION : 5;
  if (text.length < minimum) {
    return {
      ok: false,
      error: `Releasing a ${hold.kind} hold needs a justification of at least ${minimum} characters.`,
      status: 422,
    };
  }
  return {
    ok: true,
    value: { ...hold, releasedAt: new Date(now).toISOString(), releasedBy: actor, releaseJustification: text },
  };
}

// ─── deletion queue ─────────────────────────────────────────────────────────

export function requestDeletion(
  artifactIds: readonly string[],
  artifacts: ReadonlyMap<string, ManagedArtifact>,
  holds: readonly LegalHold[],
  input: { reason: string; source: DeletionRequest['source']; actor: string; now: number; id: string },
): GovernanceResult<{ request: DeletionRequest; skipped: Array<{ id: string; reason: string }> }> {
  const skipped: Array<{ id: string; reason: string }> = [];
  const accepted: string[] = [];
  for (const id of [...new Set(artifactIds)]) {
    const artifact = artifacts.get(id);
    if (!artifact) {
      skipped.push({ id, reason: 'not found' });
      continue;
    }
    const covering = activeHoldsFor(artifact, holds, input.now);
    if (covering.length > 0) {
      skipped.push({ id, reason: `under hold ${covering.map((hold) => hold.name).join(', ')}` });
      continue;
    }
    accepted.push(id);
  }
  if (accepted.length === 0) return { ok: false, error: 'No artifacts are eligible for deletion.', status: 409 };
  if (input.reason.trim().length < 5) return { ok: false, error: 'A deletion request needs a reason.', status: 422 };
  return {
    ok: true,
    value: {
      request: {
        id: input.id,
        artifactIds: accepted,
        reason: input.reason.trim(),
        source: input.source,
        requestedBy: input.actor,
        requestedAt: new Date(input.now).toISOString(),
        status: 'pending',
        decidedBy: null,
        decidedAt: null,
        decisionNote: null,
      },
      skipped,
    },
  };
}

export function decideDeletion(
  request: DeletionRequest,
  decision: 'approve' | 'reject',
  approver: string,
  note: string,
  artifacts: ReadonlyMap<string, ManagedArtifact>,
  holds: readonly LegalHold[],
  now: number,
): GovernanceResult<DeletionRequest> {
  if (request.status !== 'pending') return { ok: false, error: `Request is already ${request.status}.`, status: 409 };
  if (decision === 'approve' && request.requestedBy === approver) {
    return { ok: false, error: 'A deletion must be approved by someone other than the requester.', status: 403 };
  }
  if (decision === 'approve') {
    const held = request.artifactIds.filter((id) => {
      const artifact = artifacts.get(id);
      return artifact ? activeHoldsFor(artifact, holds, now).length > 0 : false;
    });
    if (held.length > 0) {
      return { ok: false, error: `Placed under hold since the request: ${held.join(', ')}.`, status: 409 };
    }
  }
  return {
    ok: true,
    value: {
      ...request,
      status: decision === 'approve' ? 'approved' : 'rejected',
      decidedBy: approver,
      decidedAt: new Date(now).toISOString(),
      decisionNote: note.trim() || null,
    },
  };
}

// ─── bulk metadata ──────────────────────────────────────────────────────────

export function applyTags(artifact: ManagedArtifact, add: readonly string[], remove: readonly string[]): ManagedArtifact {
  const normalized = (tag: string) => tag.trim().toLowerCase().replace(/[^a-z0-9:_-]/g, '-').slice(0, 40);
  const removeSet = new Set(remove.map(normalized));
  const tags = [...new Set([...artifact.tags.filter((tag) => !removeSet.has(tag)), ...add.map(normalized).filter(Boolean)])].sort();
  return { ...artifact, tags };
}

export function metadataCsv(artifacts: readonly ManagedArtifact[]): string {
  const columns = ['id', 'name', 'backend', 'type', 'sizeBytes', 'createdAt', 'campaignId', 'runId', 'sha256', 'signature', 'scan', 'quarantined', 'tags'];
  const escape = (value: string) => {
    const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
  };
  const rows = artifacts.map((artifact) =>
    [
      artifact.id,
      artifact.name,
      artifact.backend,
      artifact.type,
      String(artifact.sizeBytes),
      artifact.createdAt,
      artifact.campaignId ?? '',
      artifact.runId ?? '',
      artifact.checksums.sha256 ?? '',
      artifact.signature.status,
      artifact.scan.status,
      String(artifact.quarantine.active),
      artifact.tags.join(' '),
    ]
      .map(escape)
      .join(','),
  );
  return [columns.join(','), ...rows].join('\n');
}
