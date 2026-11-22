/**
 * Tests for the shared search input IME handling (Issue #1357).
 *
 * Uses the repo's script-style pattern (no Vitest import): plain
 * `node:assert` assertions executed via `tsc` + `node`, with the same
 * hand-rolled fake-timer environment as `lib/debounce-utils.test.ts`.
 *
 * The component keeps all search-scheduling logic in the React-free
 * `search-input-controller`, so the exact composition ordering required by the
 * issue can be simulated deterministically; the `SearchInput` component itself
 * is smoke-tested via `renderToString`.
 */

import * as assert from 'node:assert/strict';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { createSearchInputController, type SearchInputController } from './search-input-controller';
import { SearchInput } from './SearchInput';

// ── Fake timers (same approach as lib/debounce-utils.test.ts) ───────────────

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
    (global as unknown as Record<string, unknown>)["Date"] = { now: () => now };
  };

  const orig = {
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    Date: global.Date,
  };

  const uninstall = () => {
    global.setTimeout = orig.setTimeout;
    global.clearTimeout = orig.clearTimeout;
    global.Date = orig.Date;
  };

  return { install, uninstall, advance, now: () => now };
}

function makeHarness(
  options?: { delay?: number; maxWait?: number },
): { controller: SearchInputController; calls: string[]; ft: ReturnType<typeof makeFakeTimers> } {
  const calls: string[] = [];
  const ft = makeFakeTimers();
  ft.install();
  const controller = createSearchInputController((value: string) => calls.push(value), options);
  return { controller, calls, ft };
}

// ── Controller: Latin-only typing behaviour unchanged ────────────────────────

function testLatinTypingFiresSingleTrailingSearch(): void {
  const { controller, calls, ft } = makeHarness({ delay: 200 });
  try {
    controller.handleInput('auth');
    ft.advance(199);
    assert.deepEqual(calls, [], 'should not fire before the debounce delay');
    ft.advance(1);
    assert.deepEqual(calls, ['auth'], 'should fire once after the delay');
  } finally {
    ft.uninstall();
  }
}

function testLatinTypingResetsTimerAndFiresLatestValue(): void {
  const { controller, calls, ft } = makeHarness({ delay: 200 });
  try {
    controller.handleInput('auth');
    ft.advance(100);
    controller.handleInput('auth area');
    ft.advance(199);
    assert.deepEqual(calls, [], 'pending call should have been reset');
    ft.advance(1);
    assert.deepEqual(calls, ['auth area'], 'should fire with the latest value');
  } finally {
    ft.uninstall();
  }
}

function testDefaultsAreUsedWhenNoOptionsSupplied(): void {
  const { controller, calls, ft } = makeHarness();
  try {
    controller.handleInput('x');
    ft.advance(499);
    assert.deepEqual(calls, [], 'default delay (500ms) should not have elapsed yet');
    ft.advance(1);
    assert.deepEqual(calls, ['x'], 'should fire using the default delay');
  } finally {
    ft.uninstall();
  }
}

// ── Controller: composition suppresses intermediate searches ─────────────────

function testNoSearchFiresDuringComposition(): void {
  const { controller, calls, ft } = makeHarness({ delay: 200 });
  try {
    controller.handleCompositionStart();
    controller.handleInput('zhong');
    controller.handleInput('zhong');
    controller.handleInput('zhongguo');
    // Even well past the debounce delay AND the maxWait window, no search may
    // fire while composition is still active.
    ft.advance(5000);
    assert.deepEqual(calls, [], 'intermediate composition values must not trigger a search');
  } finally {
    ft.uninstall();
  }
}

function testCompositionEndsWithExactlyOneTrailingSearch(): void {
  const { controller, calls, ft } = makeHarness({ delay: 200 });
  try {
    controller.handleCompositionStart();
    controller.handleInput('zhong');
    controller.handleInput('zhong');
    controller.handleInput('zhongguo');
    controller.handleCompositionEnd('中国');
    ft.advance(199);
    assert.deepEqual(calls, [], 'should not fire before the debounce delay elapses after compositionend');
    ft.advance(1);
    assert.deepEqual(
      calls,
      ['中国'],
      'exactly one search must fire, with the final composed value',
    );
  } finally {
    ft.uninstall();
  }
}

function testCompositionEndCompanionChangeDoesNotDoubleFire(): void {
  const { controller, calls, ft } = makeHarness({ delay: 200 });
  try {
    controller.handleCompositionStart();
    controller.handleInput('n');
    controller.handleInput('ni');
    controller.handleCompositionEnd('你');
    // Browsers frequently dispatch a companion input/change event right after
    // compositionend carrying the same final value.
    controller.handleInput('你');
    ft.advance(200);
    assert.deepEqual(calls, ['你'], 'the companion change must not fire a second search');
  } finally {
    ft.uninstall();
  }
}

function testCompositionEndDelayedCompanionChangeDoesNotDoubleFire(): void {
  const { controller, calls, ft } = makeHarness({ delay: 200 });
  try {
    controller.handleCompositionStart();
    controller.handleInput('n');
    controller.handleInput('nin');
    controller.handleCompositionEnd('您');
    ft.advance(100);
    controller.handleInput('您');
    ft.advance(99);
    assert.deepEqual(calls, [], 'pending trailing search should not have fired');
    ft.advance(1);
    assert.deepEqual(calls, ['您'], 'still exactly one search for the final value');
  } finally {
    ft.uninstall();
  }
}

// ── Controller: pending pre-composition debounce must not leak ───────────────

function testPendingPreCompositionSearchIsCancelled(): void {
  const { controller, calls, ft } = makeHarness({ delay: 200 });
  try {
    controller.handleInput('abc'); // schedules 'abc' to fire at +200ms
    ft.advance(100);
    controller.handleCompositionStart();
    controller.handleInput('中');
    controller.handleCompositionEnd('中');
    ft.advance(199);
    assert.deepEqual(calls, [], 'the pre-composition value must not fire during composition');
    ft.advance(1);
    assert.deepEqual(calls, ['中'], 'only the final composed value may fire');
  } finally {
    ft.uninstall();
  }
}

function testCompositionEndingOnPendingValueStillFires(): void {
  const { controller, calls, ft } = makeHarness({ delay: 200 });
  try {
    controller.handleInput('abc');
    ft.advance(100);
    controller.handleCompositionStart();
    // The composition ends on the same string that was pending before it
    // started. The composition-start cancellation must have cleared the
    // de-dupe slot so this still fires exactly once.
    controller.handleCompositionEnd('abc');
    ft.advance(200);
    assert.deepEqual(calls, ['abc'], 'final composed value must still fire even if it equals the pending string');
  } finally {
    ft.uninstall();
  }
}

// ── Controller: repeated composition resets cleanly ──────────────────────────

function testBackToBackCompositionsFireOnlyLastFinalValue(): void {
  const { controller, calls, ft } = makeHarness({ delay: 200 });
  try {
    controller.handleCompositionStart();
    controller.handleInput('zhong');
    controller.handleCompositionEnd('中');
    controller.handleCompositionStart();
    controller.handleInput('zhong');
    controller.handleCompositionEnd('中国');
    ft.advance(200);
    assert.deepEqual(calls, ['中国'], 'only the final composition should produce a search');
  } finally {
    ft.uninstall();
  }
}

// ── Controller: lifecycle ────────────────────────────────────────────────────

function testSetOnSearchUsesLatestCallback(): void {
  const ft = makeFakeTimers();
  ft.install();
  try {
    const oldCalls: string[] = [];
    const newCalls: string[] = [];
    const controller = createSearchInputController((value) => oldCalls.push(value), { delay: 200 });
    controller.setOnSearch((value) => newCalls.push(value));
    controller.handleInput('z');
    ft.advance(200);
    assert.deepEqual(oldCalls, [], 'stale callback must not receive the search');
    assert.deepEqual(newCalls, ['z'], 'latest callback must receive the search');
  } finally {
    ft.uninstall();
  }
}

function testDisposeCancelsPendingSearch(): void {
  const { controller, calls, ft } = makeHarness({ delay: 200 });
  try {
    controller.handleInput('pending');
    controller.dispose();
    ft.advance(500);
    assert.deepEqual(calls, [], 'dispose() must cancel any pending search');
  } finally {
    ft.uninstall();
  }
}

// ── Component: rendering smoke tests (no fake timers) ────────────────────────

function testComponentRendersSearchInput(): void {
  const html = renderToString(
    React.createElement(SearchInput, {
      value: 'hello',
      onChange: () => {},
      onSearch: () => {},
      placeholder: 'Search runs…',
      'aria-label': 'Search runs',
      className: 'search-field',
    }),
  );
  assert.ok(html.includes('type="search"'), 'defaults to type="search"');
  assert.ok(html.includes('value="hello"'), 'forwards the controlled value');
  assert.ok(html.includes('placeholder="Search runs…"'), 'forwards placeholder');
  assert.ok(html.includes('aria-label="Search runs"'), 'forwards accessibility label');
  assert.ok(html.includes('class="search-field"'), 'forwards className');
}

function testComponentHonorsExplicitTypeAndId(): void {
  const html = renderToString(
    React.createElement(SearchInput, {
      value: '',
      type: 'text',
      id: 'run-search',
      onChange: () => {},
      onSearch: () => {},
    }),
  );
  assert.ok(html.includes('type="text"'), 'explicit type overrides the default');
  assert.ok(html.includes('id="run-search"'), 'forwards id');
}

function testComponentSupportsDebounceTimingProps(): void {
  const html = renderToString(
    React.createElement(SearchInput, {
      value: '',
      onChange: () => {},
      onSearch: () => {},
      debounceDelay: 300,
      debounceMaxWait: 1000,
    }),
  );
  assert.ok(html.includes('type="search"'), 'still renders the search input');
}

// ── Runner ───────────────────────────────────────────────────────────────────

const tests: [string, () => void][] = [
  ['latin: single trailing search fires after delay', testLatinTypingFiresSingleTrailingSearch],
  ['latin: timer resets and fires latest value', testLatinTypingResetsTimerAndFiresLatestValue],
  ['latin: defaults used when no options supplied', testDefaultsAreUsedWhenNoOptionsSupplied],
  ['composition: no search fires for intermediate inputs', testNoSearchFiresDuringComposition],
  ['composition: exactly one trailing search after compositionend', testCompositionEndsWithExactlyOneTrailingSearch],
  ['composition: companion change does not double-fire', testCompositionEndCompanionChangeDoesNotDoubleFire],
  ['composition: delayed companion change does not double-fire', testCompositionEndDelayedCompanionChangeDoesNotDoubleFire],
  ['composition: pending pre-composition search is cancelled', testPendingPreCompositionSearchIsCancelled],
  ['composition: ending on the pending value still fires', testCompositionEndingOnPendingValueStillFires],
  ['composition: back-to-back compositions fire only the last value', testBackToBackCompositionsFireOnlyLastFinalValue],
  ['lifecycle: setOnSearch uses the latest callback', testSetOnSearchUsesLatestCallback],
  ['lifecycle: dispose cancels pending search', testDisposeCancelsPendingSearch],
  ['component: renders a search input with forwarded props', testComponentRendersSearchInput],
  ['component: honors explicit type and id', testComponentHonorsExplicitTypeAndId],
  ['component: supports debounce timing props', testComponentSupportsDebounceTimingProps],
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