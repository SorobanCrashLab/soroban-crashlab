/**
 * Unit tests for createMeasuredResizer.
 *
 * Drives the event-count math with an injected fake clock (no real timers /
 * DOM). Verifies the headline requirement: a burst of 20 resize events yields
 * exactly TWO computations (one leading-synchronous initial + one trailing
 * coalesced), and that teardown cancels any pending trailing measurement.
 */

import * as assert from 'node:assert/strict';
import { createMeasuredResizer } from './createMeasuredResizer';

type Scheduler = {
  schedule: (fn: () => void) => unknown;
  clear: (handle: unknown) => void;
  advance: () => void;
};

function makeFakeTimers(): Scheduler {
  let pending: (() => void) | null = null;
  return {
    schedule: (fn: () => void) => {
      pending = fn;
      return 1;
    },
    clear: (_handle: unknown) => {
      pending = null;
    },
    advance: () => {
      const fn = pending;
      pending = null;
      if (fn) fn();
    },
  };
}

class FakeRO {
  static last: FakeRO | null = null;
  private readonly cb: () => void;
  constructor(cb: () => void) {
    this.cb = cb;
    FakeRO.last = this;
  }
  observe(): void {
    /* no-op for tests */
  }
  disconnect(): void {
    /* no-op for tests */
  }
  trigger(): void {
    this.cb();
  }
}

function makeResizer(callback: () => void, timers: Scheduler) {
  return createMeasuredResizer(callback, {
    debounceMs: 100,
    scheduleTimeout: (fn) => timers.schedule(fn),
    clearTimeout: (h) => timers.clear(h),
    // Immediate frame execution keeps the math deterministic in the test.
    scheduleFrame: (fn) => {
      fn();
      return 1;
    },
    cancelFrame: () => {},
    ResizeObserver: FakeRO as unknown as typeof ResizeObserver,
  });
}

function testBurstProducesTwoComputations(): void {
  const timers = makeFakeTimers();
  let count = 0;
  const resizer = makeResizer(() => {
    count++;
  }, timers);
  resizer.observe({} as Element);

  for (let i = 0; i < 20; i++) {
    FakeRO.last!.trigger();
  }
  assert.equal(count, 1, 'first resize triggers synchronous initial measurement');
  timers.advance();
  assert.equal(count, 2, 'burst coalesces to exactly one trailing measurement');

  // Extra idle burst after settle still coalesces to a single trailing.
  for (let i = 0; i < 20; i++) {
    FakeRO.last!.trigger();
  }
  timers.advance();
  assert.equal(count, 3, 'subsequent settled bursts add one trailing each');
  console.log('  ✓ burst of 20 events -> exactly 2 computations (initial + trailing)');
}

function testTeardownCancelsPending(): void {
  const timers = makeFakeTimers();
  let count = 0;
  const resizer = makeResizer(() => {
    count++;
  }, timers);
  resizer.observe({} as Element);

  FakeRO.last!.trigger(); // initial
  for (let i = 0; i < 5; i++) FakeRO.last!.trigger(); // pending trailing
  resizer.disconnect();
  timers.advance(); // pending should have been cleared
  assert.equal(count, 1, 'disconnect cancels the pending trailing measurement');
  console.log('  ✓ disconnect tears down observer and cancels pending work');
}

function testNoComputationBeforeResize(): void {
  const timers = makeFakeTimers();
  let count = 0;
  const resizer = makeResizer(() => {
    count++;
  }, timers);
  resizer.observe({} as Element);
  assert.equal(count, 0, 'no measurement before any resize');
  timers.advance();
  assert.equal(count, 0, 'advancing idle timers measures nothing');
  console.log('  ✓ no computation occurs until a resize is observed');
}

function main(): void {
  console.log('createMeasuredResizer:');
  testBurstProducesTwoComputations();
  testTeardownCancelsPending();
  testNoComputationBeforeResize();
  console.log('all createMeasuredResizer tests passed');
}

main();
