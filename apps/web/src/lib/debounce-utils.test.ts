/**
 * Tests for debounce-utils.ts (Issue #1086).
 *
 * Uses Node's built-in assert and fake timers via the timers/promises + fake
 * timer approach available in Node 20+.  No React or jsdom required.
 */

import * as assert from 'node:assert/strict';
import {
  debounce,
  clampDelay,
  resolveSearchDelay,
  SEARCH_DEBOUNCE_DEFAULTS,
  MIN_SEARCH_DELAY,
  MAX_SEARCH_DELAY,
} from './debounce-utils';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Tiny fake-timer environment.  Replaces global setTimeout/clearTimeout with
 * versions that can be advanced manually so we do not need any test-runner
 * timer infrastructure.
 */
function makeFakeTimers() {
  let now = 0;
  const timers: Map<number, { at: number; fn: () => void }> = new Map();
  let nextId = 1;

  const fakeSetTimeout = (fn: () => void, delay: number): number => {
    const id = nextId++;
    timers.set(id, { at: now + delay, fn });
    return id;
  };

  const fakeClearTimeout = (id: number): void => {
    timers.delete(id);
  };

  const advance = (ms: number): void => {
    const target = now + ms;
    // Fire all timers that are due, in chronological order, until we reach target
    let safety = 0;
    while (true) {
      const due = [...timers.entries()]
        .filter(([, t]) => t.at <= target)
        .sort(([, a], [, b]) => a.at - b.at);
      if (due.length === 0 || safety++ > 10_000) break;
      const [id, timer] = due[0];
      now = timer.at;
      timers.delete(id);
      timer.fn();
    }
    now = target;
  };

  const install = () => {
    (global as unknown as Record<string, unknown>)["setTimeout"] = fakeSetTimeout;
    (global as unknown as Record<string, unknown>)["clearTimeout"] = fakeClearTimeout;
    // Also override Date.now so debounce's internal clock is consistent
    (global as unknown as Record<string, unknown>)["Date"] = { now: () => now };
  };

  const uninstall = (origSetTimeout: typeof setTimeout, origClearTimeout: typeof clearTimeout, origDate: typeof Date) => {
    global.setTimeout = origSetTimeout;
    global.clearTimeout = origClearTimeout;
    global.Date = origDate;
  };

  return { install, uninstall, advance, getNow: () => now };
}

// ── clampDelay ────────────────────────────────────────────────────────────────

function testClampDelayBelowMin(): void {
  assert.equal(clampDelay(50, 100, 2000), 100, 'clampDelay: below min should return min');
}

function testClampDelayAboveMax(): void {
  assert.equal(clampDelay(9000, 100, 2000), 2000, 'clampDelay: above max should return max');
}

function testClampDelayInRange(): void {
  assert.equal(clampDelay(500, 100, 2000), 500, 'clampDelay: in-range value should pass through');
}

function testClampDelayAtBoundaries(): void {
  assert.equal(clampDelay(100, 100, 2000), 100, 'clampDelay: at min boundary');
  assert.equal(clampDelay(2000, 100, 2000), 2000, 'clampDelay: at max boundary');
}

// ── resolveSearchDelay ────────────────────────────────────────────────────────

function testResolveSearchDelayDefault(): void {
  assert.equal(
    resolveSearchDelay(undefined),
    SEARCH_DEBOUNCE_DEFAULTS.delay,
    'resolveSearchDelay: undefined → default',
  );
}

function testResolveSearchDelayNaN(): void {
  assert.equal(
    resolveSearchDelay(NaN),
    SEARCH_DEBOUNCE_DEFAULTS.delay,
    'resolveSearchDelay: NaN → default',
  );
}

function testResolveSearchDelayString(): void {
  assert.equal(
    resolveSearchDelay('300'),
    SEARCH_DEBOUNCE_DEFAULTS.delay,
    'resolveSearchDelay: string → default',
  );
}

function testResolveSearchDelayBelowMin(): void {
  assert.equal(
    resolveSearchDelay(10),
    MIN_SEARCH_DELAY,
    'resolveSearchDelay: below MIN_SEARCH_DELAY → MIN_SEARCH_DELAY',
  );
}

function testResolveSearchDelayAboveMax(): void {
  assert.equal(
    resolveSearchDelay(99999),
    MAX_SEARCH_DELAY,
    'resolveSearchDelay: above MAX_SEARCH_DELAY → MAX_SEARCH_DELAY',
  );
}

function testResolveSearchDelayValidValue(): void {
  assert.equal(resolveSearchDelay(700), 700, 'resolveSearchDelay: valid value passes through');
}

function testResolveSearchDelayInfinity(): void {
  assert.equal(
    resolveSearchDelay(Infinity),
    SEARCH_DEBOUNCE_DEFAULTS.delay,
    'resolveSearchDelay: Infinity → default',
  );
}

// ── SEARCH_DEBOUNCE_DEFAULTS ──────────────────────────────────────────────────

function testDefaultDelayRaisedFrom300(): void {
  assert.ok(
    SEARCH_DEBOUNCE_DEFAULTS.delay >= 400,
    `SEARCH_DEBOUNCE_DEFAULTS.delay should be ≥ 400 ms to handle slow networks (got ${SEARCH_DEBOUNCE_DEFAULTS.delay})`,
  );
}

function testDefaultMaxWaitExists(): void {
  assert.ok(
    typeof SEARCH_DEBOUNCE_DEFAULTS.maxWait === 'number' && SEARCH_DEBOUNCE_DEFAULTS.maxWait > SEARCH_DEBOUNCE_DEFAULTS.delay,
    'SEARCH_DEBOUNCE_DEFAULTS.maxWait must exist and exceed delay',
  );
}

// ── debounce — trailing behaviour ─────────────────────────────────────────────

function testDebounceTrailingFires(): void {
  const orig = { setTimeout: global.setTimeout, clearTimeout: global.clearTimeout, Date: global.Date };
  const ft = makeFakeTimers();
  ft.install();
  try {
    const calls: string[] = [];
    const d = debounce((v: string) => calls.push(v), { delay: 200 });

    d('a');
    ft.advance(199);
    assert.deepEqual(calls, [], 'should not fire before delay');

    ft.advance(1); // total = 200 ms
    assert.deepEqual(calls, ['a'], 'should fire after delay');
  } finally {
    ft.uninstall(orig.setTimeout, orig.clearTimeout, orig.Date);
  }
}

function testDebounceTrailingResets(): void {
  const orig = { setTimeout: global.setTimeout, clearTimeout: global.clearTimeout, Date: global.Date };
  const ft = makeFakeTimers();
  ft.install();
  try {
    const calls: string[] = [];
    const d = debounce((v: string) => calls.push(v), { delay: 200 });

    d('a');
    ft.advance(100); // not yet
    d('b');         // restart timer
    ft.advance(100); // 100 ms since 'b', not yet
    assert.deepEqual(calls, [], 'timer should have been reset');

    ft.advance(100); // 200 ms since 'b'
    assert.deepEqual(calls, ['b'], 'should fire with latest value after reset');
  } finally {
    ft.uninstall(orig.setTimeout, orig.clearTimeout, orig.Date);
  }
}

function testDebounceCancelPreventsCall(): void {
  const orig = { setTimeout: global.setTimeout, clearTimeout: global.clearTimeout, Date: global.Date };
  const ft = makeFakeTimers();
  ft.install();
  try {
    const calls: string[] = [];
    const d = debounce((v: string) => calls.push(v), { delay: 200 });

    d('x');
    d.cancel();
    ft.advance(500);
    assert.deepEqual(calls, [], 'cancel() should prevent the call');
  } finally {
    ft.uninstall(orig.setTimeout, orig.clearTimeout, orig.Date);
  }
}

function testDebounceFlushFiresImmediately(): void {
  const orig = { setTimeout: global.setTimeout, clearTimeout: global.clearTimeout, Date: global.Date };
  const ft = makeFakeTimers();
  ft.install();
  try {
    const calls: string[] = [];
    const d = debounce((v: string) => calls.push(v), { delay: 200 });

    d('y');
    d.flush('y');
    assert.deepEqual(calls, ['y'], 'flush() should fire immediately');
    ft.advance(500);
    assert.deepEqual(calls, ['y'], 'flush() should cancel the pending timer too');
  } finally {
    ft.uninstall(orig.setTimeout, orig.clearTimeout, orig.Date);
  }
}

// ── debounce — maxWait behaviour ──────────────────────────────────────────────

function testDebounceMaxWaitForcesEarlyFire(): void {
  const orig = { setTimeout: global.setTimeout, clearTimeout: global.clearTimeout, Date: global.Date };
  const ft = makeFakeTimers();
  ft.install();
  try {
    const calls: string[] = [];
    const d = debounce((v: string) => calls.push(v), { delay: 300, maxWait: 600 });

    // User types every 250 ms — trailing timer never fires but maxWait should
    d('a');
    ft.advance(250);
    d('b');
    ft.advance(250);
    d('c');
    ft.advance(100); // total from first call = 600 ms → maxWait fires

    assert.ok(calls.length >= 1, 'maxWait should have forced at least one call');
  } finally {
    ft.uninstall(orig.setTimeout, orig.clearTimeout, orig.Date);
  }
}

function testDebounceWithoutMaxWaitNeverForcesEarlyFire(): void {
  const orig = { setTimeout: global.setTimeout, clearTimeout: global.clearTimeout, Date: global.Date };
  const ft = makeFakeTimers();
  ft.install();
  try {
    const calls: string[] = [];
    const d = debounce((v: string) => calls.push(v), { delay: 300 }); // no maxWait

    // Type every 250 ms — trailing timer keeps resetting
    d('a');
    ft.advance(250);
    d('b');
    ft.advance(250);
    d('c');
    ft.advance(250); // 750 ms total, but trailing timer reset to 300 ms on each call
    // still 50 ms left on the trailing timer
    assert.deepEqual(calls, [], 'without maxWait, handler should not fire while user keeps typing');

    ft.advance(50);
    assert.deepEqual(calls, ['c'], 'trailing handler fires after silence');
  } finally {
    ft.uninstall(orig.setTimeout, orig.clearTimeout, orig.Date);
  }
}

// ── runner ────────────────────────────────────────────────────────────────────

const tests: [string, () => void][] = [
  // clampDelay
  ['clampDelay: below min', testClampDelayBelowMin],
  ['clampDelay: above max', testClampDelayAboveMax],
  ['clampDelay: in range', testClampDelayInRange],
  ['clampDelay: at boundaries', testClampDelayAtBoundaries],

  // resolveSearchDelay
  ['resolveSearchDelay: undefined → default', testResolveSearchDelayDefault],
  ['resolveSearchDelay: NaN → default', testResolveSearchDelayNaN],
  ['resolveSearchDelay: string → default', testResolveSearchDelayString],
  ['resolveSearchDelay: below min', testResolveSearchDelayBelowMin],
  ['resolveSearchDelay: above max', testResolveSearchDelayAboveMax],
  ['resolveSearchDelay: valid value', testResolveSearchDelayValidValue],
  ['resolveSearchDelay: Infinity → default', testResolveSearchDelayInfinity],

  // SEARCH_DEBOUNCE_DEFAULTS
  ['SEARCH_DEBOUNCE_DEFAULTS: delay ≥ 400', testDefaultDelayRaisedFrom300],
  ['SEARCH_DEBOUNCE_DEFAULTS: maxWait exists and > delay', testDefaultMaxWaitExists],

  // debounce
  ['debounce: trailing fires after delay', testDebounceTrailingFires],
  ['debounce: trailing resets on new call', testDebounceTrailingResets],
  ['debounce: cancel() prevents call', testDebounceCancelPreventsCall],
  ['debounce: flush() fires immediately', testDebounceFlushFiresImmediately],
  ['debounce: maxWait forces early fire', testDebounceMaxWaitForcesEarlyFire],
  ['debounce: without maxWait, no early fire', testDebounceWithoutMaxWaitNeverForcesEarlyFire],
];

let passed = 0;
let failed = 0;

for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err instanceof Error ? err.message : err}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
