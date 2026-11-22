import * as assert from 'node:assert/strict';
import {
  normaliseSignature,
  tokenise,
  fingerprint,
  similarity,
  bucketByFingerprint,
  findSimilarPairs,
  UnionFind,
} from './failure-fingerprint';

/* ------------------------------------------------------------------ */
/*  normaliseSignature                                                 */
/* ------------------------------------------------------------------ */

function testAddressStripping(): void {
  const result = normaliseSignature(
    'transfer at 0x1a2b3c4d5e6f to 0xDEADBEEF failed',
  );
  assert.ok(!result.includes('0x1a2b3c4d5e6f'), 'hex address stripped');
  assert.ok(!result.includes('0xDEADBEEF'), 'uppercase hex address stripped');
  assert.ok(result.includes('<addr>'), 'placeholder inserted (lowercased)');
  console.log('  ✓ address stripping');
}

function testHexOffsetStripping(): void {
  const result = normaliseSignature('overflow at +0x1a2b in budget');
  assert.ok(!result.includes('+0x1a2b'), 'hex offset stripped');
  assert.ok(result.includes('+<offset>'), 'offset placeholder inserted (lowercased)');
  console.log('  ✓ hex offset stripping');
}

function testLineColStripping(): void {
  const result = normaliseSignature('panic at lib.rs:42:10 in transfer');
  assert.ok(result.includes('lib.rs'), 'filename preserved');
  assert.ok(!result.includes(':42:10'), 'line:col stripped');
  console.log('  ✓ line:col stripping');
}

function testWhitespaceNormalisation(): void {
  const result = normaliseSignature('  too   many   spaces  ');
  assert.equal(result, 'too many spaces');
  console.log('  ✓ whitespace normalisation');
}

function testLowercasing(): void {
  const result = normaliseSignature('InvariantViolation');
  assert.ok(result.includes('invariantviolation'), 'lowercased');
  console.log('  ✓ lowercasing');
}

/* ------------------------------------------------------------------ */
/*  tokenise                                                           */
/* ------------------------------------------------------------------ */

function testTokeniseColonDelimited(): void {
  const tokens = tokenise('sig:token:transfer:assert');
  assert.deepEqual(tokens, ['assert', 'sig', 'token', 'transfer']);
  console.log('  ✓ tokenise colon-delimited');
}

function testTokeniseDeduplication(): void {
  const tokens = tokenise('a:b:a:c');
  assert.deepEqual(tokens, ['a', 'b', 'c']);
  console.log('  ✓ tokenise deduplication');
}

function testTokeniseEmpty(): void {
  const tokens = tokenise('');
  assert.deepEqual(tokens, []);
  console.log('  ✓ tokenise empty');
}

/* ------------------------------------------------------------------ */
/*  fingerprint                                                        */
/* ------------------------------------------------------------------ */

function testFingerprintDeterministic(): void {
  const a = fingerprint('sig:token:transfer:assert');
  const b = fingerprint('sig:token:transfer:assert');
  assert.equal(a.hash, b.hash, 'same input → same hash');
  assert.deepEqual(a.components, b.components, 'same input → same components');
  console.log('  ✓ fingerprint determinism');
}

function testFingerprintDifferentInputs(): void {
  const a = fingerprint('sig:token:transfer:assert');
  const b = fingerprint('sig:router:swap:budget');
  assert.notEqual(a.hash, b.hash, 'different inputs → different hash');
  console.log('  ✓ fingerprint divergence');
}

function testFingerprintStripsAddresses(): void {
  const a = fingerprint('transfer at 0xAAAA to 0xBBBB');
  const b = fingerprint('transfer at 0xCCCC to 0xDDDD');
  assert.equal(a.hash, b.hash, 'addresses stripped → same fingerprint');
  console.log('  ✓ fingerprint address stripping');
}

function testFingerprintStripsLineCol(): void {
  const a = fingerprint('panic at lib.rs:42:10 in transfer');
  const b = fingerprint('panic at lib.rs:99:20 in transfer');
  assert.equal(a.hash, b.hash, 'line:col stripped → same fingerprint');
  console.log('  ✓ fingerprint line:col tolerance');
}

function testFingerprintFalseMergeResistance(): void {
  const a = fingerprint('assert_balance_nonnegative at 0x1234');
  const b = fingerprint('assert_balance_positive at 0x5678');
  // These share some tokens but have distinct core semantics.
  assert.notEqual(
    a.hash,
    b.hash,
    'semantically distinct signatures must not collide',
  );
  const sim = similarity(a, b);
  assert.ok(sim < 1.0, 'similarity < 1.0 for distinct signatures');
  console.log(`  ✓ false-merge resistance (similarity=${sim.toFixed(3)})`);
}

/* ------------------------------------------------------------------ */
/*  similarity                                                         */
/* ------------------------------------------------------------------ */

function testSimilarityIdentical(): void {
  const a = fingerprint('sig:token:transfer');
  const b = fingerprint('sig:token:transfer');
  assert.equal(similarity(a, b), 1.0);
  console.log('  ✓ similarity identical');
}

function testSimilarityDisjoint(): void {
  const a = fingerprint('aaa:bbb:ccc');
  const b = fingerprint('xxx:yyy:zzz');
  assert.equal(similarity(a, b), 0.0);
  console.log('  ✓ similarity disjoint');
}

function testSimilarityPartial(): void {
  const a = fingerprint('sig:token:transfer:assert');
  const b = fingerprint('sig:token:transfer:verify');
  const sim = similarity(a, b);
  assert.ok(sim > 0.5 && sim < 1.0, `expected partial similarity, got ${sim}`);
  console.log(`  ✓ similarity partial (${sim.toFixed(3)})`);
}

/* ------------------------------------------------------------------ */
/*  bucketByFingerprint                                                */
/* ------------------------------------------------------------------ */

function testBucketByFingerprintBasic(): void {
  const sigs = [
    'sig:token:transfer:assert', // A
    'at 0xDEAD to 0xBEEF',      // B
    'at 0x1111 to 0x2222',      // same fingerprint as B (addresses stripped)
    'sig:token:transfer:assert', // same as A
  ];
  const buckets = bucketByFingerprint(sigs);
  assert.equal(buckets.size, 2, 'two distinct fingerprint buckets');
  console.log('  ✓ bucketByFingerprint basic');
}

/* ------------------------------------------------------------------ */
/*  findSimilarPairs                                                   */
/* ------------------------------------------------------------------ */

function testFindSimilarPairs(): void {
  const sigs = [
    'sig:token:transfer:assert',
    'sig:token:transfer:verify',
    'completely:different:signature',
  ];
  const buckets = bucketByFingerprint(sigs);
  const pairs = findSimilarPairs(buckets, 0.5);
  // The first two share 3/5 tokens = 0.6 similarity; the third is disjoint.
  assert.ok(pairs.length >= 1, 'at least one similar pair found');
  console.log(`  ✓ findSimilarPairs (${pairs.length} pair(s))`);
}

/* ------------------------------------------------------------------ */
/*  UnionFind                                                          */
/* ------------------------------------------------------------------ */

function testUnionFindBasic(): void {
  const uf = new UnionFind();
  uf.union('a', 'b');
  uf.union('b', 'c');
  assert.equal(uf.find('a'), uf.find('c'), 'a and c connected');
  assert.notEqual(uf.find('a'), uf.find('d'), 'a and d disjoint');
  console.log('  ✓ UnionFind basic');
}

/* ------------------------------------------------------------------ */
/*  Run all tests                                                      */
/* ------------------------------------------------------------------ */

testAddressStripping();
testHexOffsetStripping();
testLineColStripping();
testWhitespaceNormalisation();
testLowercasing();
testTokeniseColonDelimited();
testTokeniseDeduplication();
testTokeniseEmpty();
testFingerprintDeterministic();
testFingerprintDifferentInputs();
testFingerprintStripsAddresses();
testFingerprintStripsLineCol();
testFingerprintFalseMergeResistance();
testSimilarityIdentical();
testSimilarityDisjoint();
testSimilarityPartial();
testBucketByFingerprintBasic();
testFindSimilarPairs();
testUnionFindBasic();
console.log('failure-fingerprint.test.ts: all assertions passed');
