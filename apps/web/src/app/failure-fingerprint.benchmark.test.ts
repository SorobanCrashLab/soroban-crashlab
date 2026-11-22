/**
 * Performance benchmark for failure-signature fingerprinting (issue #1419).
 *
 * Generates 10k signatures, fingerprints and buckets them, and asserts
 * completion in < 300ms.
 *
 * Run locally with:
 *   pnpm run test:fingerprint-benchmark
 */

import * as assert from 'node:assert/strict';
import { bucketByFingerprint } from './failure-fingerprint';

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function main(): void {
  const rand = mulberry32(42);
  const N = 10000;
  const funcs = [
    'transfer',
    'burn',
    'mint',
    'swap',
    'claim',
    'stake',
    'vote',
    'deploy',
  ];
  const areas = [
    'auth',
    'state',
    'budget',
    'xdr',
    'env',
    'crypto',
    'storage',
    'ledger',
  ];
  const errs = [
    'assert_balance_nonnegative',
    'overflow',
    'underflow',
    'invalid_token',
    'unauthorized',
    'insufficient_funds',
    'contract_not_found',
    'entry_conflict',
  ];

  const sigs: string[] = [];
  for (let i = 0; i < N; i++) {
    const fn = funcs[Math.floor(rand() * funcs.length)];
    const area = areas[Math.floor(rand() * areas.length)];
    const err = errs[Math.floor(rand() * errs.length)];
    const addr = `0x${Math.floor(rand() * 0xffffffff).toString(16).padStart(8, '0')}`;
    const line = Math.floor(rand() * 500) + 1;
    sigs.push(
      `sig:${fn}:${err} at ${area}.rs:${line} ${addr}`,
    );
  }

  const start = process.hrtime.bigint();
  const buckets = bucketByFingerprint(sigs);
  const ms = Number(process.hrtime.bigint() - start) / 1e6;

  console.log(
    `  ✓ fingerprinted + bucketed ${N} signatures into ${buckets.size} buckets in ${ms.toFixed(1)}ms`,
  );
  assert.ok(ms < 300, `took ${ms.toFixed(1)}ms, budget is 300ms`);

  // Sanity: every original signature should appear in exactly one bucket.
  let totalInBuckets = 0;
  for (const bucket of buckets.values()) {
    totalInBuckets += bucket.length;
  }
  assert.equal(totalInBuckets, N, 'all signatures accounted for');
}

main();
console.log('failure-fingerprint.benchmark.test.ts: all assertions passed');
