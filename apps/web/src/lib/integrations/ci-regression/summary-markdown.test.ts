import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyReport, fixtureId, summarizeDeltas } from './classify';
import {
  buildCheckSummary,
  buildStickyCommentBody,
  escapeMarkdown,
  STICKY_COMMENT_MARKER,
} from './summary-markdown';
import type { CiRegressionResult, RegressionBaseline, RegressionCaseReport, RegressionSuiteReport } from './types';

const GOLDEN_DIR = path.join(__dirname, '__golden__');
const golden = (name: string) => fs.readFileSync(path.join(GOLDEN_DIR, name), 'utf8');

function row(seed: number, expected: string, actual: string | null, passed: boolean, error: string | null = null): RegressionCaseReport {
  return {
    seed_id: seed,
    mode: 'invoker',
    expected_failure_class: expected,
    actual_failure_class: actual,
    passed,
    error,
  };
}

function report(cases: RegressionCaseReport[]): RegressionSuiteReport {
  const passed = cases.filter((c) => c.passed).length;
  return { schema: 1, total: cases.length, passed, failed: cases.length - passed, cases };
}

const BASELINE: RegressionBaseline = {
  schema: 1,
  knownFailures: [
    { fixture: 'seed-7-invoker', signature: 'empty-input' },
    { fixture: 'seed-8-invoker', signature: 'auth' },
    { fixture: 'seed-9-invoker', signature: 'state' },
  ],
};

/** One fixture of every classification, listed out of order on purpose. */
const MIXED_REPORT = report([
  row(42, 'xdr', 'xdr', true), // unchanged
  row(9, 'budget', 'budget', true), // fixed (was failing with `state`)
  row(3, 'auth', 'state', false), // new
  row(7, 'auth', 'empty-input', false), // recurring
  row(8, 'auth', 'budget', false), // new: known failure, but the signature changed
  row(11, 'invalid-enum-tag', 'invalid-enum-tag', true), // unchanged
  row(5, 'xdr', null, false, 'invalid input_payload hex: Odd number of digits'), // new (error)
]);

function result(fixtures = classifyReport(MIXED_REPORT, BASELINE)): CiRegressionResult {
  return {
    schemaVersion: 1,
    repository: 'SorobanCrashLab/soroban-crashlab',
    commitSha: '0123456789abcdef0123456789abcdef01234567',
    prNumber: 1891,
    ref: 'refs/pull/1891/merge',
    event: 'pull_request',
    suiteRunId: '1000-1',
    runUrl: 'https://github.com/SorobanCrashLab/soroban-crashlab/actions/runs/1000',
    completedAt: '2026-10-16T00:00:00.000Z',
    fixtures,
    artifacts: [],
  };
}

describe('classifyReport', () => {
  it('classifies against the baseline and orders blocking first, then by id', () => {
    const fixtures = classifyReport(MIXED_REPORT, BASELINE);
    expect(fixtures.map((f) => [f.id, f.classification])).toEqual([
      ['seed-3-invoker', 'new'],
      ['seed-5-invoker', 'new'],
      ['seed-8-invoker', 'new'],
      ['seed-7-invoker', 'recurring'],
      ['seed-9-invoker', 'fixed'],
      ['seed-11-invoker', 'unchanged'],
      ['seed-42-invoker', 'unchanged'],
    ]);
  });

  it('records the baseline signature only when it changed', () => {
    const byId = new Map(classifyReport(MIXED_REPORT, BASELINE).map((f) => [f.id, f]));
    expect(byId.get('seed-8-invoker')?.baselineSignature).toBe('auth');
    expect(byId.get('seed-7-invoker')?.baselineSignature).toBeNull();
    expect(byId.get('seed-5-invoker')?.outcome).toBe('error');
  });

  it('is independent of input order and keeps the first copy of a duplicated seed', () => {
    const shuffled = report([...MIXED_REPORT.cases].reverse());
    expect(classifyReport(shuffled, BASELINE).map((f) => f.id)).toEqual(
      classifyReport(MIXED_REPORT, BASELINE).map((f) => f.id),
    );
    const duplicated = report([row(1, 'xdr', 'xdr', true), row(1, 'xdr', 'auth', false)]);
    const fixtures = classifyReport(duplicated, { schema: 1, knownFailures: [] });
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].classification).toBe('unchanged');
  });

  it('counts deltas with new fixtures as blocking', () => {
    expect(summarizeDeltas(classifyReport(MIXED_REPORT, BASELINE))).toEqual({
      new: 3,
      recurring: 1,
      fixed: 1,
      unchanged: 2,
      total: 7,
      blocking: 3,
    });
    expect(fixtureId({ seed_id: 7, mode: 'invoker' })).toBe('seed-7-invoker');
  });
});

describe('sticky comment markdown (golden)', () => {
  it('renders a regressed run', () => {
    expect(buildStickyCommentBody(result())).toBe(golden('sticky-regressed.md'));
  });

  it('renders a clean run', () => {
    const clean = report([row(42, 'xdr', 'xdr', true), row(7, 'auth', 'empty-input', false)]);
    expect(buildStickyCommentBody(result(classifyReport(clean, BASELINE)))).toBe(golden('sticky-clean.md'));
  });

  it('renders the concise check summary', () => {
    const check = buildCheckSummary(result());
    expect(check.title).toBe('Regression gate: 3 new failures');
    expect(check.summary).toBe(golden('check-regressed.md'));
  });

  it('is deterministic and starts with the marker', () => {
    const body = buildStickyCommentBody(result());
    expect(body.startsWith(`${STICKY_COMMENT_MARKER}\n`)).toBe(true);
    expect(buildStickyCommentBody(result())).toBe(body);
  });
});

describe('escapeMarkdown', () => {
  it('neutralises table breaks, html, mentions and newlines from fixture text', () => {
    expect(escapeMarkdown('a|b <img src=x> @maintainers\nnext `x`')).toBe(
      'a\\|b \\<img src=x\\> @​maintainers next \\`x\\`',
    );
  });

  it('keeps hostile fixture text from breaking the comment table', () => {
    const hostile = report([row(1, 'auth', 'x | y\n## heading @everyone', false)]);
    const body = buildStickyCommentBody(result(classifyReport(hostile, { schema: 1, knownFailures: [] })));
    const line = body.split('\n').find((l) => l.startsWith('| `seed-1-invoker`'));
    expect(line).toBe('| `seed-1-invoker` | auth | x \\| y \\#\\# heading @​everyone |');
  });
});
