/**
 * Similarity-based cluster merge/split overlay (issue #1419).
 *
 * Layers semantic grouping atop the exact-match clustering produced by
 * `failureClusters.ts`.  Original exact clusters are always preserved
 * underneath; the overlay is a lightweight map from cluster-ID → group-ID
 * with a full audit trail.
 */

import {
  fingerprint,
  similarity,
  type Fingerprint,
} from './failure-fingerprint';
import type { FailureCluster } from './failureClusters';

/* ------------------------------------------------------------------ */
/*  Audit trail                                                        */
/* ------------------------------------------------------------------ */

export type MergeAction = 'merge' | 'split';

export interface MergeAuditEntry {
  /** Monotonically increasing sequence number. */
  seq: number;
  /** 'merge' or 'split'. */
  action: MergeAction;
  /** UTC ISO-8601 timestamp. */
  timestamp: string;
  /** Identity of the actor (user ID, email, or 'system'). */
  actor: string;
  /** Cluster IDs involved in this action. */
  clusterIds: string[];
  /** The group ID this action created or dissolved. */
  groupId: string;
  /** Human-readable description. */
  description: string;
}

/* ------------------------------------------------------------------ */
/*  Merge overlay state                                                */
/* ------------------------------------------------------------------ */

export interface MergeOverlay {
  /** Maps cluster ID → semantic group ID.  Clusters not in this map belong
   *  to their own singleton group (identity mapping). */
  groupMap: Map<string, string>;
  /** Ordered audit log. */
  auditLog: MergeAuditEntry[];
  /** Next sequence number. */
  nextSeq: number;
}

/** Create an empty overlay. */
export function createOverlay(): MergeOverlay {
  return {
    groupMap: new Map(),
    auditLog: [],
    nextSeq: 1,
  };
}

/* ------------------------------------------------------------------ */
/*  Fingerprint cache (avoids re-computing for hot paths)              */
/* ------------------------------------------------------------------ */

const fpCache = new Map<string, Fingerprint>();

/** Get or compute the fingerprint for a cluster's signature. */
export function clusterFingerprint(cluster: FailureCluster): Fingerprint {
  let fp = fpCache.get(cluster.signature);
  if (!fp) {
    fp = fingerprint(cluster.signature);
    fpCache.set(cluster.signature, fp);
  }
  return fp;
}

/* ------------------------------------------------------------------ */
/*  Automatic similarity-based merging                                 */
/* ------------------------------------------------------------------ */

/**
 * Auto-merge clusters whose fingerprints exceed the similarity threshold.
 * Returns the updated overlay (mutated in place for convenience).
 *
 * Only clusters not already in a merged group are considered; existing
 * manual merges are never overwritten.
 */
export function autoMergeBySimilarity(
  clusters: FailureCluster[],
  overlay: MergeOverlay,
  threshold = 0.75,
): MergeOverlay {
  // Build a list of (clusterId, fingerprint) for clusters not yet merged.
  const candidates: Array<{ id: string; fp: Fingerprint }> = [];
  for (const c of clusters) {
    if (!overlay.groupMap.has(c.id)) {
      candidates.push({ id: c.id, fp: clusterFingerprint(c) });
    }
  }

  // Union-find over candidate cluster IDs.
  const uf = new Map<string, string>();
  const find = (x: string): string => {
    if (!uf.has(x)) uf.set(x, x);
    if (uf.get(x) !== x) uf.set(x, find(uf.get(x)!));
    return uf.get(x)!;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) uf.set(ra, rb);
  };

  // Pairwise similarity — O(n²) but clusters are typically small.
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      if (similarity(candidates[i].fp, candidates[j].fp) >= threshold) {
        union(candidates[i].id, candidates[j].id);
      }
    }
  }

  // Group clusters that were unioned together.
  const groups = new Map<string, string[]>();
  for (const c of candidates) {
    const root = find(c.id);
    const list = groups.get(root);
    if (list) {
      list.push(c.id);
    } else {
      groups.set(root, [c.id]);
    }
  }

  // Apply merges for groups with >1 member.
  for (const memberIds of groups.values()) {
    if (memberIds.length < 2) continue;
    const groupId = `sem:${memberIds.sort().join(':')}`;
    for (const id of memberIds) {
      overlay.groupMap.set(id, groupId);
    }
    overlay.auditLog.push({
      seq: overlay.nextSeq++,
      action: 'merge',
      timestamp: new Date().toISOString(),
      actor: 'system',
      clusterIds: memberIds,
      groupId,
      description: `Auto-merged ${memberIds.length} clusters by similarity ≥ ${threshold}`,
    });
  }

  return overlay;
}

/* ------------------------------------------------------------------ */
/*  Manual merge / split                                               */
/* ------------------------------------------------------------------ */

/**
 * Manually merge a set of cluster IDs into a single semantic group.
 * Returns the updated overlay.
 */
export function manualMerge(
  clusterIds: string[],
  overlay: MergeOverlay,
  actor: string,
  groupId?: string,
): MergeOverlay {
  if (clusterIds.length < 2) return overlay;

  const resolvedId = groupId ?? `manual:${clusterIds.sort().join(':')}`;
  for (const id of clusterIds) {
    overlay.groupMap.set(id, resolvedId);
  }

  overlay.auditLog.push({
    seq: overlay.nextSeq++,
    action: 'merge',
    timestamp: new Date().toISOString(),
    actor,
    clusterIds,
    groupId: resolvedId,
    description: `Manual merge of ${clusterIds.length} clusters`,
  });

  return overlay;
}

/**
 * Split a group back into individual clusters (dissolve the overlay entry).
 * Returns the updated overlay.
 */
export function splitGroup(
  groupId: string,
  overlay: MergeOverlay,
  actor: string,
): MergeOverlay {
  const clusterIds: string[] = [];
  for (const [cid, gid] of overlay.groupMap) {
    if (gid === groupId) {
      clusterIds.push(cid);
      overlay.groupMap.delete(cid);
    }
  }

  if (clusterIds.length > 0) {
    overlay.auditLog.push({
      seq: overlay.nextSeq++,
      action: 'split',
      timestamp: new Date().toISOString(),
      actor,
      clusterIds,
      groupId,
      description: `Split group ${groupId} into ${clusterIds.length} individual clusters`,
    });
  }

  return overlay;
}

/* ------------------------------------------------------------------ */
/*  Group resolution helpers                                           */
/* ------------------------------------------------------------------ */

export interface MergedClusterGroup {
  groupId: string;
  clusters: FailureCluster[];
  /** Representative fingerprint (from the first cluster's signature). */
  fingerprint: Fingerprint;
  totalCount: number;
}

/**
 * Resolve clusters into merged groups using the overlay.
 * Clusters without an overlay entry remain as singleton groups.
 */
export function resolveGroups(
  clusters: FailureCluster[],
  overlay: MergeOverlay,
): MergedClusterGroup[] {
  const groupMap = new Map<string, MergedClusterGroup>();

  for (const c of clusters) {
    const groupId = overlay.groupMap.get(c.id) ?? c.id;
    let group = groupMap.get(groupId);
    if (!group) {
      group = {
        groupId,
        clusters: [],
        fingerprint: clusterFingerprint(c),
        totalCount: 0,
      };
      groupMap.set(groupId, group);
    }
    group.clusters.push(c);
    group.totalCount += c.count;
  }

  // Sort by total count descending, then by group ID.
  return Array.from(groupMap.values()).sort((a, b) =>
    b.totalCount !== a.totalCount
      ? b.totalCount - a.totalCount
      : a.groupId.localeCompare(b.groupId),
  );
}
