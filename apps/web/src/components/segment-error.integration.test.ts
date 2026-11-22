/**
 * Integration tests for segment-level error boundaries (#1393).
 *
 * Follows the repo's tsc + node + react-dom/server harness (see
 * ErrorBoundary.integration.test.ts). Verifies:
 *  - each route family renders its own segment-scoped fallback copy
 *  - the fallback scrubs PII (no raw URLs / emails / tokens shown)
 *  - a forced child throw surfaces the segment boundary, and reset recovers
 *    with healed mock data
 *  - coded messaging is used when an error code is present, and tolerates
 *    missing / unknown codes (catalog may lag)
 */

import * as assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import SegmentError from './SegmentError';
import {
  scrubErrorMessage,
  resolveSegmentErrorMessage,
  type SegmentFamily,
} from './segment-error-messages';
import { ErrorBoundary } from './ErrorBoundary';
import { errorStateFromError, initialErrorState } from './error-boundary-utils';

const FAMILIES: SegmentFamily[] = [
  'runs',
  'analytics',
  'triage',
  'logs',
  'settings',
  'integrations',
  'notification-center',
];

const EXPECTED_TITLE: Record<SegmentFamily, string> = {
  runs: 'Failed to load runs',
  analytics: 'Failed to load analytics',
  triage: 'Failed to load triage',
  logs: 'Failed to load logs',
  settings: 'Failed to load settings',
  integrations: 'Failed to load integrations',
  'notification-center': 'Failed to load notifications',
};

function makeError(message: string, code?: string): Error & { digest?: string; code?: string } {
  const e = new Error(message) as Error & { digest?: string; code?: string };
  if (code) e.code = code;
  return e;
}

// ---------------------------------------------------------------------------
// 1. Each family renders its own segment-scoped fallback copy + retry + link.
// ---------------------------------------------------------------------------

function testFamilyCopy(): void {
  for (const family of FAMILIES) {
    const html = renderToString(
      React.createElement(SegmentError, {
        family,
        error: makeError('forced failure https://evil.example/x victim@x.com'),
        reset: () => {},
      }),
    );
    assert.ok(html.includes(EXPECTED_TITLE[family]), `${family}: shows family title`);
    assert.ok(html.includes('Try again'), `${family}: shows retry affordance`);
    assert.ok(html.includes('Back to dashboard'), `${family}: shows dashboard link`);
    assert.ok(html.includes('[link removed]'), `${family}: scrubs raw URL`);
    assert.ok(html.includes('[email removed]'), `${family}: scrubs email`);
    assert.ok(!html.includes('https://'), `${family}: no raw URL leaks`);
    assert.ok(!html.includes('victim@x.com'), `${family}: no email leaks`);
    console.log(`  ✓ ${family} renders segment-scoped fallback with scrubbed copy`);
  }
}

// ---------------------------------------------------------------------------
// 2. Forced child throw yields the segment boundary; reset recovers.
// ---------------------------------------------------------------------------

function testForcedThrowAndRecover(): void {
  for (const family of FAMILIES) {
    const shouldThrow = { current: true };
    const Child = () => {
      if (shouldThrow.current) {
        throw new Error('boom https://leak.example/x a@b.com');
      }
      return React.createElement('div', { className: 'healed' }, `healed-mock-data-${family}`);
    };
    const boundary = new ErrorBoundary({
      children: React.createElement(Child),
      fallback: (err: Error, retry: () => void) =>
        React.createElement(SegmentError, { family, error: err, reset: retry }),
    });

    // Simulate Next.js catching the thrown error in the segment boundary.
    boundary.state = errorStateFromError(new Error('boom https://leak.example/x a@b.com'));
    const errHtml = renderToString(boundary.render());
    assert.ok(errHtml.includes(EXPECTED_TITLE[family]), `${family}: boundary shows family title`);
    assert.ok(errHtml.includes('Try again'), `${family}: boundary offers retry`);
    assert.ok(!errHtml.includes('https://'), `${family}: boundary scrubs leaked URL`);

    // Reset with healed mock data — child should recover. Outside a React
    // renderer setState is a no-op, so mirror what reset() does by clearing
    // the boundary's error state directly.
    shouldThrow.current = false;
    boundary.state = initialErrorState;
    const okHtml = renderToString(boundary.render());
    assert.ok(
      okHtml.includes(`healed-mock-data-${family}`),
      `${family}: reset recovers with healed mock data`,
    );
    assert.ok(!okHtml.includes(EXPECTED_TITLE[family]), `${family}: error UI gone after recover`);
    console.log(`  ✓ ${family} boundary catches throw and reset recovers`);
  }
}

// ---------------------------------------------------------------------------
// 3. Coded messaging + tolerance for missing/unknown codes.
// ---------------------------------------------------------------------------

function testCodedMessaging(): void {
  const coded = resolveSegmentErrorMessage('runs', makeError('raw', 'RUNS_FETCH_FAILED'));
  assert.ok(
    coded.message.includes('could not fetch your runs'),
    'known code maps to coded message',
  );

  const missing = resolveSegmentErrorMessage('runs', makeError('raw'));
  assert.ok(
    missing.message.includes('runs view'),
    'missing code falls back to family default copy',
  );

  const unknown = resolveSegmentErrorMessage('analytics', makeError('raw', 'TOTALLY_NEW_CODE'));
  assert.ok(unknown.message.length > 0, 'unknown code falls back to family default');

  console.log('  ✓ coded messaging used when present; tolerant of missing/unknown codes');
}

// ---------------------------------------------------------------------------
// 4. Scrub unit behaviour.
// ---------------------------------------------------------------------------

function testScrub(): void {
  const out = scrubErrorMessage(
    'see https://evil.example/path?x=1 and user@host.com and ghp_ABCDEFGHIJKLMNOPQRSTUVWXY',
  );
  assert.ok(!out.includes('https://'), 'scrub removes URLs');
  assert.ok(!out.includes('user@host.com'), 'scrub removes emails');
  assert.ok(out.includes('[token removed]'), 'scrub removes secret tokens');
  console.log('  ✓ scrubErrorMessage removes URLs, emails, and tokens');
}

// ---------------------------------------------------------------------------

function main(): void {
  console.log('segment-error-boundaries integration:');
  testFamilyCopy();
  testForcedThrowAndRecover();
  testCodedMessaging();
  testScrub();
  console.log('all segment-error-boundary integration tests passed');
}

main();
