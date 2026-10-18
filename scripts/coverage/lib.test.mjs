// node --test scripts/coverage/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  changedLinesCoverage,
  diffCoverage,
  evaluateRatchet,
  parseCoverageReport,
  parseIstanbulSummary,
  parseLcov,
  parseLcovSummary,
  parseLlvmCovJson,
  parseUnifiedDiffLines,
  relativize,
  buildBaseline,
} from './lib.mjs';

test('relativize strips the root prefix and normalises separators', () => {
  assert.equal(relativize('/repo/apps/web/src/a.ts', '/repo/apps/web'), 'src/a.ts');
  assert.equal(relativize('apps\\web\\src\\a.ts', 'apps/web'), 'src/a.ts');
  assert.equal(relativize('/other/x.ts', '/repo'), '/other/x.ts');
});

test('parseIstanbulSummary reads total and per-file line percentages', () => {
  const report = parseIstanbulSummary(
    {
      total: { lines: { pct: 62.419 } },
      '/repo/src/lib/a.ts': { lines: { pct: 80 } },
      '/repo/src/lib/b.ts': { lines: { pct: 40.005 } },
    },
    '/repo',
  );
  assert.equal(report.totalPct, 62.42);
  assert.deepEqual(report.files, { 'src/lib/a.ts': 80, 'src/lib/b.ts': 40.01 });
});

test('parseLlvmCovJson reads the LLVM coverage export shape', () => {
  const report = parseLlvmCovJson(
    {
      data: [
        {
          files: [
            { filename: '/repo/contracts/crashlab-core/src/a.rs', summary: { lines: { percent: 75.5 } } },
          ],
          totals: { lines: { percent: 55 } },
        },
      ],
    },
    '/repo',
  );
  assert.equal(report.totalPct, 55);
  assert.deepEqual(report.files, { 'contracts/crashlab-core/src/a.rs': 75.5 });
});

test('parseCoverageReport dispatches on format', () => {
  const summary = JSON.stringify({ total: { lines: { pct: 50 } } });
  assert.equal(parseCoverageReport(summary, 'istanbul-summary').totalPct, 50);
});

test('diffCoverage reports total delta, per-file regressions and new files', () => {
  const baseline = { total: { lines: 60 }, files: { 'a.ts': 80, 'b.ts': 50 } };
  const current = { totalPct: 58.5, files: { 'a.ts': 78, 'b.ts': 50, 'c.ts': 10 } };
  const diff = diffCoverage(baseline, current, 1);
  assert.equal(diff.totalDelta, -1.5);
  assert.deepEqual(diff.regressions, [{ file: 'a.ts', baseline: 80, current: 78, delta: -2 }]);
  assert.deepEqual(diff.newFiles, [{ file: 'c.ts', current: 10 }]);
});

test('diffCoverage ignores drops within tolerance', () => {
  const baseline = { total: { lines: 60 }, files: { 'a.ts': 80 } };
  const current = { totalPct: 59.5, files: { 'a.ts': 79.5 } };
  const diff = diffCoverage(baseline, current, 1);
  assert.equal(diff.regressions.length, 0);
});

test('parseLcov reads records and relativizes paths', () => {
  const lcov = [
    'SF:/repo/src/a.ts',
    'DA:1,5',
    'DA:2,0',
    'end_of_record',
    'SF:/repo/src/b.ts',
    'DA:10,3',
    'end_of_record',
  ].join('\n');
  assert.deepEqual(parseLcov(lcov, '/repo'), {
    'src/a.ts': { 1: 5, 2: 0 },
    'src/b.ts': { 10: 3 },
  });
});

test('parseLcovSummary computes per-file and total percentages from LF/LH', () => {
  const lcov = [
    'SF:/repo/src/a.ts',
    'LF:2',
    'LH:1',
    'end_of_record',
    'SF:/repo/src/b.ts',
    'LF:2',
    'LH:2',
    'end_of_record',
  ].join('\n');
  const summary = parseLcovSummary(lcov, '/repo');
  assert.equal(summary.totalPct, 75);
  assert.deepEqual(summary.files, { 'src/a.ts': 50, 'src/b.ts': 100 });
});

test('parseLcovSummary falls back to DA records', () => {
  const lcov = ['SF:/repo/src/a.ts', 'DA:1,1', 'DA:2,0', 'DA:3,0', 'end_of_record'].join('\n');
  assert.deepEqual(parseLcovSummary(lcov, '/repo'), { totalPct: 33.33, files: { 'src/a.ts': 33.33 } });
});

test('parseCoverageReport handles the lcov format', () => {
  const summary = parseCoverageReport('SF:/repo/a.ts\nLF:1\nLH:1\nend_of_record', 'lcov', '/repo');
  assert.equal(summary.totalPct, 100);
});

test('buildBaseline sorts files and records the measured total', () => {
  const baseline = buildBaseline(
    { totalPct: 61.5, files: { 'z.ts': 10, 'a.ts': 20 } },
    { stack: 'web', tool: 'vitest', tolerancePct: 0.5, changedLinesMinimum: 60, generatedAt: '2026-10-17' },
  );
  assert.deepEqual(Object.keys(baseline.files), ['a.ts', 'z.ts']);
  assert.equal(baseline.total.lines, 61.5);
  assert.equal(baseline.tolerancePct, 0.5);
  assert.equal(baseline.generatedAt, '2026-10-17');
});

test('parseUnifiedDiffLines collects the new-side line numbers', () => {
  const diff = [
    'diff --git a/src/a.ts b/src/a.ts',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1,2 +1,3 @@',
    '+new',
    '@@ -10 +11,2 @@',
    '+x',
    '+y',
  ].join('\n');
  assert.deepEqual([...parseUnifiedDiffLines(diff)['src/a.ts']].sort((a, b) => a - b), [1, 2, 3, 11, 12]);
});

test('changedLinesCoverage counts only instrumented changed lines', () => {
  const lcov = { 'src/a.ts': { 1: 1, 2: 0, 3: 4 } };
  const changed = { 'src/a.ts': new Set([1, 2, 99]), 'src/none.ts': new Set([5]) };
  const result = changedLinesCoverage(lcov, changed);
  assert.equal(result.instrumented, 2);
  assert.equal(result.covered, 1);
  assert.equal(result.pct, 50);
  assert.deepEqual(result.uncovered, [{ file: 'src/a.ts', line: 2 }]);
});

test('changedLinesCoverage is 100% when nothing changed is instrumented', () => {
  assert.equal(changedLinesCoverage({}, { 'src/a.ts': new Set([1]) }).pct, 100);
});

test('evaluateRatchet fails on total drop, file regression and changed-lines floor', () => {
  const diff = {
    totalDelta: -2,
    regressions: [{ file: 'a.ts', baseline: 80, current: 70, delta: -10 }],
  };
  const changed = { pct: 30, covered: 3, instrumented: 10, uncovered: [] };
  const verdict = evaluateRatchet({ diff, changed, tolerance: 1, changedLinesMinimum: 50 });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reasons.length, 3);
});

test('evaluateRatchet passes when everything is within budget', () => {
  const diff = { totalDelta: 0.5, regressions: [] };
  const verdict = evaluateRatchet({ diff, changed: null, tolerance: 1, changedLinesMinimum: 50 });
  assert.equal(verdict.ok, true);
});
