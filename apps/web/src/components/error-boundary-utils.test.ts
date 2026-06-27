import * as assert from 'node:assert/strict';
import {
  initialErrorState,
  errorStateFromError,
  resetErrorState,
  haveResetKeysChanged,
} from './error-boundary-utils';

const runAssertions = () => {
  // A healthy boundary starts with no error.
  assert.deepEqual(initialErrorState, { hasError: false, error: null });

  // Catching an error flips the boundary into its fallback state.
  const boom = new Error('kaboom');
  assert.deepEqual(errorStateFromError(boom), { hasError: true, error: boom });

  // #839: retrying must clear the captured error so children re-render.
  const afterReset = resetErrorState();
  assert.equal(afterReset.hasError, false);
  assert.equal(afterReset.error, null);
  // Reset returns a fresh object (not a shared mutable reference).
  assert.notEqual(afterReset, initialErrorState);

  // resetKeys change detection.
  assert.equal(haveResetKeysChanged(undefined, ['a']), false);
  assert.equal(haveResetKeysChanged(['a'], undefined), false);
  assert.equal(haveResetKeysChanged(['a'], ['a']), false);
  assert.equal(haveResetKeysChanged(['a'], ['b']), true);
  assert.equal(haveResetKeysChanged(['a'], ['a', 'b']), true);
  assert.equal(haveResetKeysChanged([1, 2], [1, 2]), false);
  assert.equal(haveResetKeysChanged([1, 2], [1, 3]), true);
  // NaN compares equal to itself via Object.is, so no spurious reset.
  assert.equal(haveResetKeysChanged([NaN], [NaN]), false);

  console.log('error-boundary-utils: all assertions passed');
};

runAssertions();
