/**
 * Append-only audit log for sensitive maintainer actions (#1431).
 *
 * One chokepoint — `AuditLog.append` — writes every entry. Callers describe
 * *what* happened; the log decides the timestamp, the sequence number and the
 * hash. Accepting either from a caller would let a compromised call site forge
 * history, so the append input has no field for them.
 *
 * Entries are chained: each carries the hash of its predecessor, so editing an
 * entry in storage breaks every hash after it and the verifier says where.
 *
 * Capacity: the log is append-only by design and rotation is deliberately out
 * of scope. The viewer paginates; an operator running at high volume will need
 * a rotation story before this grows unbounded.
 */

import { createHash } from 'node:crypto';
import { redactMetadata } from './redaction';

export const GENESIS_HASH = '0'.repeat(64);

export type AuditAction =
  | 'run.delete'
  | 'token.revoke'
  | 'config.bundle.import'
  | 'rbac.change'
  | 'dlq.purge'
  | 'dlq.replay'
  | 'dlq.park'
  | 'upload.reject'
  | 'thread.resolve'
  | 'artifact.delete'
  | 'webhook.secret.rotate'
  | 'webhook.secret.revokeGrace'
  | 'auth.login'
  | 'auth.login.denied'
  | 'auth.role.grant'
  | 'tenant.access.denied'
  | 'quota.override';
  | 'triage.status'
  | 'triage.assign'
  | 'triage.priority'
  | 'triage.bulk'
  | 'tenant.access.denied';

/** Used when no principal could be resolved — availability over attribution. */
export const SYSTEM_ACTOR = 'system';

export interface AuditEntryInput {
  action: AuditAction;
  /** What was acted on: a run id, endpoint, bundle section, etc. */
  target: string;
  /** Resolved principal; falls back to `system` when RBAC cannot name one. */
  actor?: string;
  /** Redacted before storage. Use before/after for edits, counts for bulk. */
  metadata?: Record<string, unknown>;
  /** Owning org (#1894); absent for deployment-wide events and legacy entries. */
  orgId?: string;
}

export interface AuditEntry {
  /** Monotonic, assigned by the log. */
  sequence: number;
  timestamp: string;
  actor: string;
  action: AuditAction;
  target: string;
  metadata: Record<string, unknown>;
  orgId?: string;
  prevHash: string;
  hash: string;
}

export interface AuditGateway {
  load(): AuditEntry[];
  save(entries: readonly AuditEntry[]): void;
}

export class AppendOnlyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppendOnlyViolationError';
  }
}

/**
 * Wraps a gateway so the only accepted write is "everything already stored,
 * unchanged, plus new entries". Updates, deletions, truncation and reordering
 * are refused at the storage boundary, whoever the caller is (#1895).
 */
export function createAppendOnlyGateway(inner: AuditGateway): AuditGateway {
  return {
    load: () => inner.load(),
    save: (next) => {
      const current = inner.load();
      if (next.length < current.length) {
        throw new AppendOnlyViolationError('audit log entries cannot be deleted');
      }
      current.forEach((entry, index) => {
        if (!next[index] || JSON.stringify(next[index]) !== JSON.stringify(entry)) {
          throw new AppendOnlyViolationError(`audit entry ${entry.sequence} cannot be modified`);
        }
      });
      inner.save(next);
    },
  };
}

export function createInMemoryAuditGateway(seed: readonly AuditEntry[] = []): AuditGateway {
  let entries = [...seed];
  return {
    load: () => [...entries],
    save: (next) => {
      entries = [...next];
    },
  };
}

/**
 * The hashed pre-image. Field order is fixed here rather than taken from the
 * object, so a re-serialised entry hashes identically. `orgId` is appended
 * only when present, so entries written before it existed keep their hashes.
 */
export function entryPreimage(entry: Omit<AuditEntry, 'hash'>): string {
  const fields: unknown[] = [
    entry.sequence,
    entry.timestamp,
    entry.actor,
    entry.action,
    entry.target,
    entry.metadata,
    entry.prevHash,
  ];
  if (entry.orgId !== undefined) fields.push(entry.orgId);
  return JSON.stringify(fields);
}

export function hashEntry(entry: Omit<AuditEntry, 'hash'>): string {
  return createHash('sha256').update(entryPreimage(entry), 'utf8').digest('hex');
}

export type ChainStatus = 'intact' | 'broken' | 'empty';

export interface ChainVerification {
  status: ChainStatus;
  /** Sequence number of the first entry that failed, when broken. */
  brokenAt?: number;
  reason?: string;
}

/**
 * Walks the chain from the genesis hash. Reports the first break rather than
 * every downstream consequence of it — one edit invalidates the tail.
 */
export function verifyChain(entries: readonly AuditEntry[]): ChainVerification {
  if (entries.length === 0) return { status: 'empty' };

  let expectedPrev = GENESIS_HASH;

  for (const [index, entry] of entries.entries()) {
    if (entry.sequence !== index + 1) {
      return {
        status: 'broken',
        brokenAt: entry.sequence,
        reason: `Entry ${entry.sequence} is out of sequence (expected ${index + 1}).`,
      };
    }
    if (entry.prevHash !== expectedPrev) {
      return {
        status: 'broken',
        brokenAt: entry.sequence,
        reason: `Entry ${entry.sequence} does not link to its predecessor.`,
      };
    }
    const { hash, ...rest } = entry;
    if (hashEntry(rest) !== hash) {
      return {
        status: 'broken',
        brokenAt: entry.sequence,
        reason: `Entry ${entry.sequence} has been modified since it was written.`,
      };
    }
    expectedPrev = hash;
  }

  return { status: 'intact' };
}

export interface AuditLogOptions {
  gateway?: AuditGateway;
  /** Server clock. Never a caller-supplied timestamp. */
  now?: () => Date;
}

export class AuditLog {
  private readonly gateway: AuditGateway;
  private readonly now: () => Date;

  constructor(options: AuditLogOptions = {}) {
    this.gateway = createAppendOnlyGateway(options.gateway ?? createInMemoryAuditGateway());
    this.now = options.now ?? (() => new Date());
  }

  /** The single write path. Returns the entry as stored. */
  append(input: AuditEntryInput): AuditEntry {
    const entries = this.gateway.load();
    const previous = entries.at(-1);

    const withoutHash: Omit<AuditEntry, 'hash'> = {
      sequence: entries.length + 1,
      timestamp: this.now().toISOString(),
      actor: normaliseActor(input.actor),
      action: input.action,
      target: input.target,
      metadata: (redactMetadata(input.metadata ?? {}) ?? {}) as Record<string, unknown>,
      prevHash: previous?.hash ?? GENESIS_HASH,
      ...(input.orgId !== undefined && { orgId: input.orgId }),
    };

    const entry: AuditEntry = { ...withoutHash, hash: hashEntry(withoutHash) };
    this.gateway.save([...entries, entry]);
    return entry;
  }

  list(): AuditEntry[] {
    return this.gateway.load();
  }

  verify(): ChainVerification {
    return verifyChain(this.gateway.load());
  }
}

function normaliseActor(actor?: string): string {
  const trimmed = actor?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : SYSTEM_ACTOR;
}
