import * as assert from 'node:assert/strict';
import {
  normalizeTag,
  normalizedIdentity,
  validateTag,
  addTag,
  removeTag,
  runMatchesTagFilter,
  mergeDuplicateTags,
  MAX_TAG_LENGTH,
  MAX_TAGS_PER_RUN,
} from './run-tags-utils';

const runAssertions = () => {
  assert.equal(normalizeTag('  Needs Repro  '), 'needs-repro');
  assert.equal(normalizeTag('SHIP-BLOCKER'), 'ship-blocker');

  // Normalization matrix: trim + lowercase collapses case/whitespace variants
  // while preserving the first-created display casing.
  assert.equal(normalizedIdentity('Auth'), 'auth');
  assert.equal(normalizedIdentity('auth-with-space'), 'auth-with-space');
  assert.equal(normalizedIdentity('  ALL-CAPS  '), 'all-caps');
  assert.equal(normalizedIdentity(' partner followup '), 'partner followup');
  assert.equal(normalizedIdentity('  trim  '), 'trim');

  assert.deepEqual(validateTag('valid-tag'), { valid: true });
  assert.deepEqual(validateTag('   '), { valid: false, error: 'Tag cannot be empty' });

  const longTag = 'a'.repeat(MAX_TAG_LENGTH + 1);
  assert.deepEqual(validateTag(longTag), {
    valid: false,
    error: `Tag exceeds ${MAX_TAG_LENGTH} character limit`,
  });

  const add1 = addTag([], 'First Tag');
  assert.equal(add1.success, true);
  assert.deepEqual(add1.tags, ['first-tag']);

  const add2 = addTag(['existing'], '  trimmed  ');
  assert.equal(add2.success, true);
  assert.deepEqual(add2.tags, ['existing', 'trimmed']);

  // Duplicate attempts (differing only by case/whitespace) surface an inline
  // error that names the existing tag.
  const addDup = addTag(['foo'], 'FOO');
  assert.equal(addDup.success, false);
  assert.ok(addDup.error && addDup.error.includes('foo'), 'error should name existing tag');
  assert.deepEqual(addDup.tags, ['foo']);

  const addDupSpace = addTag(['Auth'], '   auth   ');
  assert.equal(addDupSpace.success, false);
  assert.ok(addDupSpace.error && addDupSpace.error.includes('Auth'));

  const maxTags = Array.from({ length: MAX_TAGS_PER_RUN }, (_, i) => `tag-${i}`);
  const addMax = addTag(maxTags, 'overflow');
  assert.equal(addMax.success, false);

  assert.deepEqual(removeTag(['a', 'b', 'c'], 'B'), ['a', 'c']);
  assert.deepEqual(removeTag(['Auth', 'b'], 'auth'), ['b']);

  // Filter comparison is normalized so case/whitespace variants never fragment.
  assert.equal(runMatchesTagFilter(['high-fee'], [], 'high-fee'), true);
  assert.equal(runMatchesTagFilter([], ['auth-surface'], 'auth-surface'), true);
  assert.equal(runMatchesTagFilter(['High-Fee'], [], 'high-fee'), true);
  assert.equal(runMatchesTagFilter(['high-fee'], [], 'HIGH-FEE'), true);
  assert.equal(runMatchesTagFilter(['fee-ok'], [], 'high-fee'), false);
  assert.equal(runMatchesTagFilter([], [], null), true);
};

const mergeAssertions = () => {
  const tags = ['auth', 'Auth', 'AUTH', 'security', 'SECURITY ', 'network'];
  const assignments = {
    runA: ['Auth', 'security'],
    runB: ['AUTH', 'SECURITY '],
    runC: ['auth', 'network'],
    runD: ['AUTH'],
  };

  const result = mergeDuplicateTags(tags, assignments);

  // First-seen casing retained for each normalized identity.
  assert.deepEqual(result.tags.sort(), ['auth', 'network', 'security']);

  // References re-pointed to canonical tags in every assignment.
  assert.deepEqual(result.assignments.runA, ['auth', 'security']);
  assert.deepEqual(result.assignments.runB, ['auth', 'security']);
  assert.deepEqual(result.assignments.runC, ['auth', 'network']);
  assert.deepEqual(result.assignments.runD, ['auth']);

  // Total assignment counts preserved after merge.
  const totalBefore = Object.values(assignments).reduce((sum, list) => sum + list.length, 0);
  const totalAfter = Object.values(result.assignments).reduce((sum, list) => sum + list.length, 0);
  assert.equal(totalAfter, totalBefore, 'total assignments preserved');

  // Merged report lists the consolidated duplicates with before/after counts.
  const authMerge = result.merged.find((m) => m.canonical === 'auth');
  assert.ok(authMerge, 'should report auth merge');
  assert.deepEqual(authMerge!.mergedInto, ['auth', 'auth']);
  assert.equal(authMerge!.beforeCount, 4);
  assert.equal(authMerge!.afterCount, 4);

  const securityMerge = result.merged.find((m) => m.canonical === 'security');
  assert.ok(securityMerge, 'should report security merge');
  assert.deepEqual(securityMerge!.mergedInto, ['security']);
  assert.equal(securityMerge!.beforeCount, 2);
  assert.equal(securityMerge!.afterCount, 2);

  // Idempotence: running the merge again returns the same result.
  const second = mergeDuplicateTags(result.tags, result.assignments);
  assert.deepEqual(second.tags.sort(), result.tags.sort());
  assert.deepEqual(second.assignments, result.assignments);
  assert.equal(second.merged.length, 0, 'no further merges on second pass');
};

runAssertions();
mergeAssertions();
console.log('run-tags-utils.test.ts: all assertions passed');

runAssertions();
console.log('run-tags-utils.test.ts: all assertions passed');
