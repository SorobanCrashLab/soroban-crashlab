import * as assert from 'node:assert/strict';
import {
  validateAnnotation,
  addAnnotation,
  removeAnnotation,
  MAX_ANNOTATION_LENGTH,
} from './run-annotations-utils';

const runAssertions = () => {
  // validateAnnotation — primary flow
  assert.deepEqual(validateAnnotation('Reproduction confirmed with seed X'), { valid: true });

  // validateAnnotation — empty string
  assert.deepEqual(validateAnnotation('   '), { valid: false, error: 'Annotation cannot be empty' });

  // validateAnnotation — exceeds max length
  const longText = 'a'.repeat(MAX_ANNOTATION_LENGTH + 1);
  assert.deepEqual(validateAnnotation(longText), {
    valid: false,
    error: `Annotation exceeds ${MAX_ANNOTATION_LENGTH} character limit`,
  });

  // addAnnotation — primary flow
  const res1 = addAnnotation([], 'First note');
  assert.equal(res1.success, true);
  assert.equal(res1.annotations.length, 1);
  assert.equal(res1.annotations[0], 'First note');

  // addAnnotation — trims whitespace
  const res2 = addAnnotation(['existing'], '  trimmed  ');
  assert.equal(res2.success, true);
  assert.equal(res2.annotations[1], 'trimmed');

  // addAnnotation — empty input rejected
  const res3 = addAnnotation(['existing'], '');
  assert.equal(res3.success, false);
  assert.equal(res3.error, 'Annotation cannot be empty');
  assert.equal(res3.annotations.length, 1);

  // addAnnotation — edge case: exactly at max length is valid
  const exactMax = 'b'.repeat(MAX_ANNOTATION_LENGTH);
  const res4 = addAnnotation([], exactMax);
  assert.equal(res4.success, true);

  // removeAnnotation — primary flow
  const removed = removeAnnotation(['a', 'b', 'c'], 1);
  assert.deepEqual(removed, ['a', 'c']);

  // removeAnnotation — edge case: out-of-bounds index returns original
  const unchanged = removeAnnotation(['a', 'b'], 5);
  assert.deepEqual(unchanged, ['a', 'b']);
};

runAssertions();
console.log('run-annotations-utils.test.ts: all assertions passed');
