import * as assert from 'node:assert/strict';
import {
  createOverlay,
  autoMergeBySimilarity,
  manualMerge,
  splitGroup,
  resolveGroups,
  clusterFingerprint,
} from './failureClusterMerge';
import type { FailureCluster } from './failureClusters';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeCluster(
  id: string,
  signature: string,
  count: number,
): FailureCluster {
  return {
    id,
    signature,
    failureCategory: 'C',
    area: 'auth',
    severity: 'high',
    count,
    representativeRunId: `run-${id}`,
    relatedRunIds: [`run-${id}`],
  };
}

/* ------------------------------------------------------------------ */
/*  createOverlay                                                      */
/* ------------------------------------------------------------------ */

function testCreateOverlayEmpty(): void {
  const overlay = createOverlay();
  assert.equal(overlay.groupMap.size, 0);
  assert.equal(overlay.auditLog.length, 0);
  assert.equal(overlay.nextSeq, 1);
  console.log('  ✓ createOverlay returns empty state');
}

/* ------------------------------------------------------------------ */
/*  autoMergeBySimilarity                                              */
/* ------------------------------------------------------------------ */

function testAutoMergeSimilarClusters(): void {
  const clusters = [
    makeCluster('c1', 'transfer from 0xAAAA to 0xBBBB', 5),
    makeCluster('c2', 'transfer from 0xCCCC to 0xDDDD', 3),
    makeCluster('c3', 'budget overflow at +0x1234', 1),
  ];

  const overlay = createOverlay();
  autoMergeBySimilarity(clusters, overlay, 0.75);

  // c1 and c2 should be merged (addresses vary but core is same).
  const g1 = overlay.groupMap.get('c1');
  const g2 = overlay.groupMap.get('c2');
  assert.equal(g1, g2, 'c1 and c2 merged into same group');
  assert.notEqual(g1, overlay.groupMap.get('c3'), 'c3 remains separate');

  // Audit entry should exist.
  assert.equal(overlay.auditLog.length, 1);
  assert.equal(overlay.auditLog[0].action, 'merge');
  assert.equal(overlay.auditLog[0].actor, 'system');
  console.log('  ✓ autoMergeBySimilarity merges address-variant clusters');
}

function testAutoMergeNoMergeBelowThreshold(): void {
  const clusters = [
    makeCluster('c1', 'sig:token:transfer:assert', 5),
    makeCluster('c2', 'sig:router:swap:budget', 3),
  ];

  const overlay = createOverlay();
  autoMergeBySimilarity(clusters, overlay, 0.75);

  assert.equal(overlay.groupMap.size, 0, 'no clusters merged');
  assert.equal(overlay.auditLog.length, 0, 'no audit entries');
  console.log('  ✓ autoMergeBySimilarity respects threshold');
}

/* ------------------------------------------------------------------ */
/*  manualMerge                                                        */
/* ------------------------------------------------------------------ */

function testManualMerge(): void {
  const overlay = createOverlay();
  manualMerge(['c1', 'c2', 'c3'], overlay, 'user@example.com');

  assert.equal(overlay.groupMap.size, 3);
  const gid = overlay.groupMap.get('c1');
  assert.equal(overlay.groupMap.get('c2'), gid);
  assert.equal(overlay.groupMap.get('c3'), gid);

  assert.equal(overlay.auditLog.length, 1);
  assert.equal(overlay.auditLog[0].action, 'merge');
  assert.equal(overlay.auditLog[0].actor, 'user@example.com');
  assert.equal(overlay.auditLog[0].clusterIds.length, 3);
  console.log('  ✓ manualMerge groups clusters and records audit');
}

function testManualMergeSingleClusterNoop(): void {
  const overlay = createOverlay();
  manualMerge(['c1'], overlay, 'user@example.com');
  assert.equal(overlay.groupMap.size, 0, 'no-op for single cluster');
  assert.equal(overlay.auditLog.length, 0, 'no audit entry for noop');
  console.log('  ✓ manualMerge single cluster is no-op');
}

/* ------------------------------------------------------------------ */
/*  splitGroup                                                         */
/* ------------------------------------------------------------------ */

function testSplitGroup(): void {
  const overlay = createOverlay();
  manualMerge(['c1', 'c2', 'c3'], overlay, 'user@example.com');
  const gid = overlay.groupMap.get('c1')!;

  splitGroup(gid, overlay, 'user@example.com');

  assert.equal(overlay.groupMap.size, 0, 'all entries removed');
  assert.equal(overlay.auditLog.length, 2, 'split audit entry added');
  assert.equal(overlay.auditLog[1].action, 'split');
  console.log('  ✓ splitGroup dissolves group and records audit');
}

/* ------------------------------------------------------------------ */
/*  resolveGroups                                                      */
/* ------------------------------------------------------------------ */

function testResolveGroupsSingletons(): void {
  const clusters = [
    makeCluster('c1', 'sig:a', 5),
    makeCluster('c2', 'sig:b', 3),
  ];
  const overlay = createOverlay();

  const groups = resolveGroups(clusters, overlay);
  assert.equal(groups.length, 2, 'two singleton groups');
  assert.equal(groups[0].clusters.length, 1);
  console.log('  ✓ resolveGroups with no overlay → singletons');
}

function testResolveGroupsMerged(): void {
  const clusters = [
    makeCluster('c1', 'transfer from 0xAAAA to 0xBBBB', 5),
    makeCluster('c2', 'transfer from 0xCCCC to 0xDDDD', 3),
    makeCluster('c3', 'budget overflow', 1),
  ];
  const overlay = createOverlay();
  autoMergeBySimilarity(clusters, overlay, 0.75);

  const groups = resolveGroups(clusters, overlay);
  // c1+c2 merged → 1 group, c3 standalone → 1 group = 2 total.
  assert.equal(groups.length, 2);
  const merged = groups.find((g) => g.clusters.length > 1);
  assert.ok(merged, 'merged group exists');
  assert.equal(merged!.totalCount, 8, 'counts summed');
  console.log('  ✓ resolveGroups merges and sums counts');
}

/* ------------------------------------------------------------------ */
/*  clusterFingerprint cache                                           */
/* ------------------------------------------------------------------ */

function testClusterFingerprintCaching(): void {
  const c = makeCluster('c1', 'sig:token:transfer', 1);
  const fp1 = clusterFingerprint(c);
  const fp2 = clusterFingerprint(c);
  assert.strictEqual(fp1, fp2, 'cached reference is identical');
  console.log('  ✓ clusterFingerprint caches correctly');
}

/* ------------------------------------------------------------------ */
/*  Run all tests                                                      */
/* ------------------------------------------------------------------ */

testCreateOverlayEmpty();
testAutoMergeSimilarClusters();
testAutoMergeNoMergeBelowThreshold();
testManualMerge();
testManualMergeSingleClusterNoop();
testSplitGroup();
testResolveGroupsSingletons();
testResolveGroupsMerged();
testClusterFingerprintCaching();
console.log('failureClusterMerge.test.ts: all assertions passed');
