import * as assert from 'node:assert/strict';
import {
  normalizeTag,
  validateTag,
  addTag,
  removeTag,
  runMatchesTagFilter,
  MAX_TAG_LENGTH,
  MAX_TAGS_PER_RUN,
} from './run-tags-utils';

const runAssertions = () => {
  assert.equal(normalizeTag('  Needs Repro  '), 'needs-repro');
  assert.equal(normalizeTag('SHIP-BLOCKER'), 'ship-blocker');

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

  const addDup = addTag(['foo'], 'FOO');
  assert.equal(addDup.success, true);
  assert.deepEqual(addDup.tags, ['foo']);

  const maxTags = Array.from({ length: MAX_TAGS_PER_RUN }, (_, i) => `tag-${i}`);
  const addMax = addTag(maxTags, 'overflow');
  assert.equal(addMax.success, false);

  assert.deepEqual(removeTag(['a', 'b', 'c'], 'B'), ['a', 'c']);

  assert.equal(runMatchesTagFilter(['high-fee'], [], 'high-fee'), true);
  assert.equal(runMatchesTagFilter([], ['auth-surface'], 'auth-surface'), true);
  assert.equal(runMatchesTagFilter(['fee-ok'], [], 'high-fee'), false);
  assert.equal(runMatchesTagFilter([], [], null), true);
};

runAssertions();
console.log('run-tags-utils.test.ts: all assertions passed');
