import * as assert from 'node:assert/strict';
import {
  DEFAULT_TOAST_DURATION,
  shouldAutoDismiss,
  createToast,
  addToast,
  removeToast,
  type Toast,
} from './toast-utils';

const runAssertions = () => {
  // Default lifetime sits in the 5-6s window required by #841.
  assert.ok(DEFAULT_TOAST_DURATION >= 5000 && DEFAULT_TOAST_DURATION <= 6000);

  // createToast applies defaults.
  const t = createToast({ message: 'Request failed', variant: 'error' }, 'id-1');
  assert.deepEqual(t, {
    id: 'id-1',
    message: 'Request failed',
    variant: 'error',
    duration: DEFAULT_TOAST_DURATION,
  });

  // Caller can opt a toast out of auto-dismiss with duration 0 (manual close only).
  const sticky = createToast({ message: 'stays', duration: 0 }, 'id-2');
  assert.equal(shouldAutoDismiss(sticky), false);
  assert.equal(shouldAutoDismiss(t), true);
  assert.equal(shouldAutoDismiss({ duration: -1 }), false);
  assert.equal(shouldAutoDismiss({ duration: Number.POSITIVE_INFINITY }), false);

  // Variant defaults to "info".
  assert.equal(createToast({ message: 'hi' }, 'id-3').variant, 'info');

  // add/remove are immutable.
  const start: Toast[] = [];
  const afterAdd = addToast(start, t);
  assert.equal(start.length, 0);
  assert.deepEqual(afterAdd, [t]);

  // removeToast clears the matching id (drives both the timer and the close button).
  const afterRemove = removeToast(afterAdd, 'id-1');
  assert.deepEqual(afterRemove, []);
  // Removing an unknown id is a no-op.
  assert.deepEqual(removeToast(afterAdd, 'nope'), [t]);

  console.log('toast-utils: all assertions passed');
};

runAssertions();
