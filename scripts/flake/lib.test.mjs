import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aggregateAttempts,
  buildQuarantineEntry,
  buildReport,
  daysBetween,
  exceedsThreshold,
  extractSpecOutcomes,
  flakeStats,
  parseDate,
  proposeQuarantine,
  renderMarkdown,
  topFlaky,
  validateQuarantine,
} from './lib.mjs';

test('flakeStats detects a pass-after-failure as flaky, not green', () => {
  const stats = flakeStats(['failed', 'passed', 'passed', 'passed']);
  assert.equal(stats.flaky, true);
  assert.equal(stats.passes, 3);
  assert.equal(stats.failures, 1);
  assert.equal(stats.runs, 4);
  assert.equal(stats.rate, 25);
});

test('flakeStats ignores skipped attempts and stays clean when consistent', () => {
  assert.deepEqual(flakeStats(['passed', 'skipped', 'passed']), {
    runs: 2,
    passes: 2,
    failures: 0,
    flaky: false,
    rate: 0,
  });
  assert.equal(flakeStats(['skipped', 'skipped']).flaky, false);
  assert.equal(flakeStats([]).rate, 0);
});

test('flakeStats rate mirrors a majority-variance score', () => {
  // 4 of 5 agree; the odd one out is 20% of the sample.
  assert.equal(flakeStats(['passed', 'passed', 'passed', 'passed', 'failed']).rate, 20);
  // Evenly split.
  assert.equal(flakeStats(['passed', 'failed']).rate, 50);
});

test('exceedsThreshold is strict (>)', () => {
  assert.equal(exceedsThreshold(5, 5), false);
  assert.equal(exceedsThreshold(5.01, 5), true);
});

test('parseDate accepts strict calendar dates only', () => {
  assert.equal(parseDate('2026-10-17').toISOString(), '2026-10-17T00:00:00.000Z');
  assert.equal(parseDate('2026-2-3'), null);
  assert.equal(parseDate('2026-02-30'), null);
  assert.equal(parseDate('not-a-date'), null);
  assert.equal(parseDate(undefined), null);
  assert.equal(daysBetween(parseDate('2026-10-03'), parseDate('2026-10-17')), 14);
});

test('extractSpecOutcomes flattens nested suites and keeps stable ids', () => {
  const outcomes = extractSpecOutcomes({
    suites: [
      {
        file: 'e2e/dashboard.spec.ts',
        specs: [{ title: 'runs list', ok: true, tests: [{ results: [{ status: 'passed' }] }] }],
        suites: [
          {
            specs: [
              {
                title: 'broken table',
                ok: false,
                tests: [{ results: [{ status: 'failed' }] }],
              },
              { title: 'skipped one', ok: true, tests: [{ results: [{ status: 'skipped' }] }] },
            ],
          },
        ],
      },
    ],
  });

  assert.deepEqual(outcomes, [
    { id: 'e2e/dashboard.spec.ts::runs list', file: 'e2e/dashboard.spec.ts', title: 'runs list', status: 'passed' },
    { id: 'e2e/dashboard.spec.ts::broken table', file: 'e2e/dashboard.spec.ts', title: 'broken table', status: 'failed' },
    { id: 'e2e/dashboard.spec.ts::skipped one', file: 'e2e/dashboard.spec.ts', title: 'skipped one', status: 'skipped' },
  ]);
});

test('extractSpecOutcomes also understands Jest/Vitest --reporter=json', () => {
  const outcomes = extractSpecOutcomes({
    numTotalTests: 3,
    testResults: [
      {
        name: 'apps/web/src/lib/logger.test.ts',
        status: 'failed',
        assertionResults: [
          { fullName: 'logger writes', status: 'passed' },
          { fullName: 'logger formats', status: 'failed' },
          { title: 'logger skips', status: 'pending' },
        ],
      },
    ],
  });

  assert.deepEqual(outcomes, [
    {
      id: 'apps/web/src/lib/logger.test.ts::logger writes',
      file: 'apps/web/src/lib/logger.test.ts',
      title: 'logger writes',
      status: 'passed',
    },
    {
      id: 'apps/web/src/lib/logger.test.ts::logger formats',
      file: 'apps/web/src/lib/logger.test.ts',
      title: 'logger formats',
      status: 'failed',
    },
    {
      id: 'apps/web/src/lib/logger.test.ts::logger skips',
      file: 'apps/web/src/lib/logger.test.ts',
      title: 'logger skips',
      status: 'skipped',
    },
  ]);
});

test('aggregateAttempts merges attempts and treats a missing attempt as skipped', () => {
  const attempt1 = extractSpecOutcomes({
    suites: [
      {
        file: 'f.spec.ts',
        specs: [
          { title: 'a', ok: false, tests: [{ results: [{ status: 'failed' }] }] },
          { title: 'b', ok: true, tests: [{ results: [{ status: 'passed' }] }] },
        ],
      },
    ],
  });
  const attempt2 = extractSpecOutcomes({
    suites: [
      {
        file: 'f.spec.ts',
        specs: [{ title: 'a', ok: true, tests: [{ results: [{ status: 'passed' }] }] }],
      },
    ],
  });

  const aggregated = aggregateAttempts([attempt1, attempt2]);
  const a = aggregated.find((t) => t.title === 'a');
  const b = aggregated.find((t) => t.title === 'b');

  assert.deepEqual(a.outcomes, ['failed', 'passed']);
  assert.equal(a.flaky, true);
  assert.equal(a.rate, 50);
  // b was absent from the second attempt, which carries no signal.
  assert.deepEqual(b.outcomes, ['passed', 'skipped']);
  assert.equal(b.flaky, false);
});

test('topFlaky sorts by rate then id and honours a limit', () => {
  const aggregated = [
    { id: 'b', flaky: true, rate: 10 },
    { id: 'a', flaky: true, rate: 10 },
    { id: 'c', flaky: true, rate: 40 },
    { id: 'd', flaky: false, rate: 0 },
  ];
  const ranked = topFlaky(aggregated, 2);
  assert.deepEqual(ranked.map((t) => t.id), ['c', 'a']);
});

test('buildQuarantineEntry caps the window at the policy maximum', () => {
  const now = new Date('2026-10-17T09:00:00.000Z');
  const entry = buildQuarantineEntry({
    id: 'cargo:run_health_status_cli::reports_status',
    stack: 'rust',
    observedRate: 13,
    days: 14,
    issue: '#1825',
    now,
  });
  assert.equal(entry.quarantinedAt, '2026-10-17');
  assert.equal(entry.expiresAt, '2026-10-31');
  assert.equal(entry.observedRate, 13);

  assert.throws(
    () => buildQuarantineEntry({ id: 'x', stack: 'rust', issue: '#1', days: 15, observedRate: 10, now }),
    /days must be an integer in \[1, 14\]/,
  );
  assert.throws(
    () => buildQuarantineEntry({ id: 'x', stack: 'rust', issue: '#1', days: 0, observedRate: 10, now }),
    /days must be an integer/,
  );
});

test('proposeQuarantine only proposes tests above the threshold', () => {
  const aggregated = [
    { id: 'hot', title: 'hot', flaky: true, rate: 25, passes: 3, failures: 1 },
    { id: 'tepid', title: 'tepid', flaky: true, rate: 5, passes: 19, failures: 1 },
  ];
  const proposed = proposeQuarantine(aggregated, 5, {
    now: new Date('2026-10-17T00:00:00.000Z'),
    days: 7,
    stack: 'web',
    issue: '#1825',
  });
  assert.equal(proposed.length, 1);
  assert.equal(proposed[0].id, 'hot');
  assert.equal(proposed[0].expiresAt, '2026-10-24');
});

test('validateQuarantine accepts an empty, well-formed config', () => {
  const result = validateQuarantine(
    {
      policy: { flakyRateThreshold: 5, windowRuns: 20, maxQuarantineDays: 14 },
      quarantined: [],
    },
    { now: new Date('2026-10-17T00:00:00.000Z') },
  );
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test('validateQuarantine rejects policy drift and malformed entries', () => {
  const result = validateQuarantine(
    {
      policy: { flakyRateThreshold: 0, windowRuns: 0, maxQuarantineDays: 30 },
      quarantined: [
        {
          id: 'dup',
          stack: 'rust',
          reason: 'seen flaking',
          issue: '#1825',
          quarantinedAt: '2026-10-01',
          expiresAt: '2026-12-01',
          observedRate: 9,
        },
        {
          id: 'dup',
          stack: 'rust',
          reason: '',
          issue: '#1825',
          quarantinedAt: '2026-13-40',
          expiresAt: '2026-10-05',
          observedRate: 12,
        },
      ],
    },
    { now: new Date('2026-10-17T00:00:00.000Z') },
  );

  assert.ok(result.errors.some((e) => e.includes('flakyRateThreshold')));
  assert.ok(result.errors.some((e) => e.includes('windowRuns')));
  assert.ok(result.errors.some((e) => e.includes('maxQuarantineDays')));
  assert.ok(result.errors.some((e) => e.includes('duplicates')));
  assert.ok(result.errors.some((e) => e.includes('reason is required')));
  assert.ok(result.errors.some((e) => e.includes('valid YYYY-MM-DD')));
  assert.ok(result.errors.some((e) => e.includes('quarantine window')));
});

test('validateQuarantine warns on expiry, and escalates it under failOnExpired', () => {
  const config = {
    policy: { flakyRateThreshold: 5, windowRuns: 20, maxQuarantineDays: 14 },
    quarantined: [
      {
        id: 'stale',
        stack: 'rust',
        reason: 'seen flaking',
        issue: '#1825',
        quarantinedAt: '2026-09-01',
        expiresAt: '2026-09-15',
        observedRate: 9,
      },
    ],
  };
  const now = new Date('2026-10-17T00:00:00.000Z');

  const lenient = validateQuarantine(config, { now });
  assert.deepEqual(lenient.errors, []);
  assert.ok(lenient.warnings.some((w) => w.includes('expired on 2026-09-15')));

  const strict = validateQuarantine(config, { now, failOnExpired: true });
  assert.ok(strict.errors.some((e) => e.includes('fix the root cause')));
});

test('validateQuarantine nudges release when the rate has recovered', () => {
  const result = validateQuarantine(
    {
      policy: { flakyRateThreshold: 5, windowRuns: 20, maxQuarantineDays: 14 },
      quarantined: [
        {
          id: 'recovered',
          stack: 'rust',
          reason: 'seen flaking',
          issue: '#1825',
          quarantinedAt: '2026-10-15',
          expiresAt: '2026-10-29',
          observedRate: 5,
        },
      ],
    },
    { now: new Date('2026-10-17T00:00:00.000Z') },
  );
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some((w) => w.includes('release it')));
});

test('buildReport and renderMarkdown surface the rate for reviewers', () => {
  const aggregated = [
    { id: 'a::flaky', file: 'a', title: 'flaky', outcomes: ['passed', 'failed'], passes: 1, failures: 1, runs: 2, flaky: true, rate: 50 },
    { id: 'a::solid', file: 'a', title: 'solid', outcomes: ['passed', 'passed'], passes: 2, failures: 0, runs: 2, flaky: false, rate: 0 },
  ];
  const report = buildReport({
    aggregated,
    threshold: 5,
    windowRuns: 20,
    attemptsCount: 2,
    quarantined: [],
  });

  assert.equal(report.totals.tests, 2);
  assert.equal(report.totals.flaky, 1);
  assert.equal(report.topFlaky[0].id, 'a::flaky');

  const markdown = renderMarkdown(report);
  assert.match(markdown, /Ran 2 attempt\(s\)/);
  assert.match(markdown, /a::flaky/);
  assert.match(markdown, /50%/);
  assert.match(markdown, /flake-policy\.md/);
});

test('renderMarkdown reports a clean window plainly', () => {
  const report = buildReport({ aggregated: [], threshold: 5, windowRuns: 20, attemptsCount: 3 });
  assert.match(renderMarkdown(report), /No flaky tests detected/);
});
