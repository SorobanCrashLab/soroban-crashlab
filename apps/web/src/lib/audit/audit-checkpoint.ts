/**
 * Signed checkpoints over the audit chain head (#1895).
 *
 * The hash chain alone proves the log is internally consistent, but someone
 * with write access to the store can rewrite every entry, recompute every
 * hash, or simply drop the tail — and the chain still verifies. A checkpoint
 * is the chain head (sequence + hash) signed with a key that is not in the
 * audit store (`AUDIT_CHECKPOINT_KEY`) and stored separately. Verifying the
 * log against the latest checkpoint catches rewrites and truncation that the
 * chain cannot.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { verifyChain, type AuditEntry, type ChainVerification } from './audit-log';

export interface AuditCheckpoint {
  sequence: number;
  headHash: string;
  signedAt: string;
  signature: string;
}

export interface CheckpointStore {
  latest(): AuditCheckpoint | null;
  save(checkpoint: AuditCheckpoint): void;
}

export function createInMemoryCheckpointStore(): CheckpointStore {
  const checkpoints: AuditCheckpoint[] = [];
  return {
    latest: () => checkpoints.at(-1) ?? null,
    save: (checkpoint) => void checkpoints.push(checkpoint),
  };
}

function sign(key: string, sequence: number, headHash: string, signedAt: string): string {
  return createHmac('sha256', key).update(`crashlab-audit-checkpoint:v1:${sequence}:${headHash}:${signedAt}`).digest('hex');
}

export function createCheckpoint(entries: readonly AuditEntry[], key: string, now: Date = new Date()): AuditCheckpoint | null {
  const head = entries.at(-1);
  if (!head) return null;
  const signedAt = now.toISOString();
  return { sequence: head.sequence, headHash: head.hash, signedAt, signature: sign(key, head.sequence, head.hash, signedAt) };
}

export interface IntegrityReport extends ChainVerification {
  checkpoint: 'verified' | 'missing' | 'invalid_signature' | 'mismatch' | 'truncated';
  checkpointSequence?: number;
}

/**
 * Chain verification plus the checkpoint: the signature must hold, the log
 * must still reach the checkpointed sequence, and the entry there must carry
 * the checkpointed hash.
 */
export function verifyAuditIntegrity(
  entries: readonly AuditEntry[],
  checkpoint: AuditCheckpoint | null,
  key: string | undefined,
): IntegrityReport {
  const chain = verifyChain(entries);
  if (!checkpoint || !key) return { ...chain, checkpoint: 'missing' };

  const expected = Buffer.from(sign(key, checkpoint.sequence, checkpoint.headHash, checkpoint.signedAt));
  const actual = Buffer.from(checkpoint.signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ...chain, checkpoint: 'invalid_signature', checkpointSequence: checkpoint.sequence };
  }

  if (entries.length < checkpoint.sequence) {
    return {
      status: 'broken',
      brokenAt: entries.length + 1,
      reason: `Log ends at entry ${entries.length} but entry ${checkpoint.sequence} was checkpointed — entries were removed.`,
      checkpoint: 'truncated',
      checkpointSequence: checkpoint.sequence,
    };
  }

  if (entries[checkpoint.sequence - 1]?.hash !== checkpoint.headHash) {
    return {
      status: 'broken',
      brokenAt: chain.status === 'broken' ? chain.brokenAt : checkpoint.sequence,
      reason: chain.reason ?? `Entry ${checkpoint.sequence} differs from the signed checkpoint — the log was rewritten.`,
      checkpoint: 'mismatch',
      checkpointSequence: checkpoint.sequence,
    };
  }

  return { ...chain, checkpoint: 'verified', checkpointSequence: checkpoint.sequence };
}
