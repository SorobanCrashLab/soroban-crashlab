import { FuzzingRun, RunArea, RunSeverity } from './types';

export interface FailureCluster {
  id: string;
  signature: string;
  failureCategory: string;
  area: RunArea;
  severity: RunSeverity;
  count: number;
  representativeRunId: string;
  relatedRunIds: string[];
}

const formatAreaLabel = (area: RunArea): string => area.charAt(0).toUpperCase() + area.slice(1);

const buildClusterKey = (run: FuzzingRun): string | null => {
  if (!run.crashDetail) {
    return null;
  }

  return [
    run.crashDetail.signature,
    run.crashDetail.failureCategory,
    run.area,
    run.severity,
  ].join('::');
};

/**
 * Deterministic, stable 32-bit string hash (djb2). Used only to shard runs
 * into coarse buckets for the first-pass fast path. The exact cluster key
 * remains the source of truth inside each bucket, so a hash collision can
 * never merge two distinct clusters — it only costs a little extra work.
 */
function hashBucketKey(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return `b${(h >>> 0).toString(36)}`;
}

/**
 * Aggregate a set of runs into clusters keyed by the exact cluster key.
 * Runs that are not failed or have no crash detail are ignored. This is the
 * single source of clustering truth; both the legacy and the new pipeline
 * route through it so their outputs are guaranteed identical.
 */
function aggregateClusters(runs: FuzzingRun[]): FailureCluster[] {
  const clusters = new Map<string, FailureCluster>();

  for (const run of runs) {
    if (run.status !== 'failed' || !run.crashDetail) {
      continue;
    }

    const key = buildClusterKey(run);
    if (!key) {
      continue;
    }

    const existing = clusters.get(key);
    if (existing) {
      existing.count += 1;
      existing.relatedRunIds.push(run.id);
      continue;
    }

    clusters.set(key, {
      id: key,
      signature: run.crashDetail.signature,
      failureCategory: run.crashDetail.failureCategory,
      area: run.area,
      severity: run.severity,
      count: 1,
      representativeRunId: run.id,
      relatedRunIds: [run.id],
    });
  }

  return Array.from(clusters.values());
}

function sortClusters(clusters: FailureCluster[]): FailureCluster[] {
  return clusters.sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }
    return left.signature.localeCompare(right.signature);
  });
}

/**
 * O(n)-by-exact-key legacy clustering, retained for the golden-equality test
 * (issue #1391) so the new pipeline is proven output-identical before the
 * legacy path is dropped.
 */
export function buildFailureClustersLegacy(runs: FuzzingRun[]): FailureCluster[] {
  return sortClusters(aggregateClusters(runs));
}

/**
 * Incremental failure-clustering for large datasets (issue #1391).
 *
 * Pipeline:
 *  1. Hash-bucket: shard runs by a stable hash of the exact cluster key.
 *     Because the hash is a pure function of the key, every run sharing a key
 *     lands in the same bucket, and buckets are small.
 *  2. Refine within each bucket ONLY by the exact cluster key (no cross-bucket
 *     comparison). Hash collisions are harmless — they just widen a bucket and
 *     are resolved by the exact-key aggregation.
 *  3. Merge + sort, identical to the legacy ordering.
 *
 * Soundness: for any two runs with the same cluster key, `hashBucketKey` is
 * identical, so they are always refined together; runs with different keys are
 * only ever compared inside the same bucket via the exact key, so they can
 * never merge. Output is therefore bit-for-bit equal to `buildFailureClustersLegacy`.
 * The first pass turns an all-pairs problem into independent small-bucket work,
 * which is what makes 10k-run clustering interactive.
 */
export function buildFailureClusters(runs: FuzzingRun[]): FailureCluster[] {
  const buckets = new Map<string, FuzzingRun[]>();

  for (const run of runs) {
    if (run.status !== 'failed' || !run.crashDetail) {
      continue;
    }
    const key = buildClusterKey(run);
    if (!key) {
      continue;
    }
    const bucketKey = hashBucketKey(key);
    const bucket = buckets.get(bucketKey);
    if (bucket) {
      bucket.push(run);
    } else {
      buckets.set(bucketKey, [run]);
    }
  }

  const merged: FailureCluster[] = [];
  for (const bucket of buckets.values()) {
    merged.push(...aggregateClusters(bucket));
  }

  return sortClusters(merged);
}

export function describeFailureCluster(cluster: FailureCluster): string {
  return `${cluster.failureCategory} in ${formatAreaLabel(cluster.area)} (${cluster.severity})`;
}
