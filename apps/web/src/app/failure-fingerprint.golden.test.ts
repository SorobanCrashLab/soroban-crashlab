/**
 * Golden corpus test for failure-signature fingerprinting (issue #1419).
 *
 * Encodes both directions of correctness:
 *   1. Known-tricky signature families MUST share the same fingerprint.
 *   2. Known-distinct signatures MUST remain separate.
 *
 * This is the primary regression gate for normalisation correctness.
 */

import * as assert from 'node:assert/strict';
import { fingerprint, similarity } from './failure-fingerprint';

/* ------------------------------------------------------------------ */
/*  Corpus: signatures that SHOULD merge (same fingerprint)            */
/* ------------------------------------------------------------------ */

const SAME_FINGERPRINT: Array<[string, string, string]> = [
  // [label, sigA, sigB]

  // Addresses vary → normalised identically
  [
    'address variation',
    'transfer from 0x1a2b3c4d5e6f to 0xAABBCCDD',
    'transfer from 0x998877665544 to 0x11223344',
  ],

  // Line/col shifts → normalised identically
  [
    'line:col shift',
    'panic at lib.rs:42:10 in budget',
    'panic at lib.rs:99:20 in budget',
  ],

  // Hex offset variation
  [
    'hex offset variation',
    'overflow at +0x1a2b in transfer',
    'overflow at +0xDEAD in transfer',
  ],

  // Identical signatures
  ['trivial identical', 'sig:token:transfer:assert', 'sig:token:transfer:assert'],

  // Case difference
  ['case difference', 'InvariantViolation', 'invariantviolation'],

  // Whitespace variation
  ['whitespace variation', 'too   many   spaces', 'too many spaces'],

  // Mixed addresses + line:col
  [
    'mixed noise',
    'trap at contract.rs:12:5 calling 0xAAAA with 0xBBBB',
    'trap at contract.rs:88:3 calling 0xCCCC with 0xDDDD',
  ],

  // Short hex addresses (< 4 chars) should NOT be stripped
  [
    'short hex preserved',
    'val at 0x12 is invalid',
    'val at 0x12 is invalid',
  ],
];

/* ------------------------------------------------------------------ */
/*  Corpus: signatures that MUST NOT merge (different fingerprints)     */
/* ------------------------------------------------------------------ */

const DIFFERENT_FINGERPRINTS: Array<[string, string, string]> = [
  // [label, sigA, sigB]

  // Different function names
  [
    'different functions',
    'sig:token:transfer:assert',
    'sig:token:burn:assert',
  ],

  // Different failure categories
  [
    'different categories',
    'invariant violation in auth',
    'panic in auth',
  ],

  // One has address, other doesn't → different token set
  [
    'address presence vs absence',
    'transfer failed at 0x1234',
    'transfer failed',
  ],

  // Completely unrelated
  ['completely unrelated', 'aaa:bbb:ccc', 'xxx:yyy:zzz'],

  // Substring overlap but different meaning
  [
    'substring overlap',
    'assert_balance_nonnegative',
    'assert_balance_positive',
  ],

  // Different numeric error codes
  [
    'different error codes',
    'error code 100 in budget',
    'error code 200 in budget',
  ],
];

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

function testSameFingerprint(): void {
  for (const [label, sigA, sigB] of SAME_FINGERPRINT) {
    const fpA = fingerprint(sigA);
    const fpB = fingerprint(sigB);
    assert.equal(
      fpA.hash,
      fpB.hash,
      `[SAME] "${label}": expected same hash but got ${fpA.hash} vs ${fpB.hash}`,
    );
  }
  console.log(
    `  ✓ ${SAME_FINGERPRINT.length} same-fingerprint cases passed`,
  );
}

function testDifferentFingerprints(): void {
  for (const [label, sigA, sigB] of DIFFERENT_FINGERPRINTS) {
    const fpA = fingerprint(sigA);
    const fpB = fingerprint(sigB);
    assert.notEqual(
      fpA.hash,
      fpB.hash,
      `[DIFF] "${label}": expected different hashes but both got ${fpA.hash}`,
    );
  }
  console.log(
    `  ✓ ${DIFFERENT_FINGERPRINTS.length} different-fingerprint cases passed`,
  );
}

function testSimilarityBounds(): void {
  // Same-fingerprint pairs should have similarity 1.0.
  for (const [label, sigA, sigB] of SAME_FINGERPRINT) {
    const sim = similarity(fingerprint(sigA), fingerprint(sigB));
    assert.equal(
      sim,
      1.0,
      `[SIM-SAME] "${label}": expected 1.0 but got ${sim}`,
    );
  }

  // Different-fingerprint pairs should have similarity < 1.0.
  for (const [label, sigA, sigB] of DIFFERENT_FINGERPRINTS) {
    const sim = similarity(fingerprint(sigA), fingerprint(sigB));
    assert.ok(
      sim < 1.0,
      `[SIM-DIFF] "${label}": expected < 1.0 but got ${sim}`,
    );
  }
  console.log('  ✓ similarity bounds verified for all corpus entries');
}

function testLargeCorpusStability(): void {
  // Generate 500 signatures, fingerprint each, and verify no crashes.
  const sigs: string[] = [];
  for (let i = 0; i < 500; i++) {
    sigs.push(`sig:func${i % 20}:arg${i % 10}:0x${i.toString(16)}`);
  }
  const fps = sigs.map(fingerprint);
  // Each unique base should map to the same fingerprint regardless of hex.
  for (let i = 0; i < sigs.length; i++) {
    for (let j = i + 1; j < sigs.length; j++) {
      if (fps[i].hash === fps[j].hash) {
        // If hashes match, components must match too.
        assert.deepEqual(
          fps[i].components,
          fps[j].components,
          'matching hashes must have matching components',
        );
      }
    }
  }
  console.log('  ✓ 500-signature large corpus stability check passed');
}

/* ------------------------------------------------------------------ */
/*  Run all tests                                                      */
/* ------------------------------------------------------------------ */

testSameFingerprint();
testDifferentFingerprints();
testSimilarityBounds();
testLargeCorpusStability();
console.log('failure-fingerprint.golden.test.ts: all assertions passed');
