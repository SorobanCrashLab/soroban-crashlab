#!/usr/bin/env node
/**
 * Coverage ratchet check (issue #1822).
 *
 * Compares a fresh coverage report against the committed baseline:
 *   - the repo total may not drop by more than the tolerance;
 *   - no file may drop by more than the tolerance;
 *   - when an LCOV report and a PR diff are supplied, the changed lines must be
 *     at least as covered as the baseline total.
 *
 * Report-only by default; pass `--enforce` to fail. The workflow starts in
 * report-only mode for the first baseline and flips via COVERAGE_ENFORCE.
 *
 * Usage:
 *   node scripts/coverage/check-coverage-ratchet.mjs \
 *     --format istanbul-summary \
 *     --report apps/web/coverage/coverage-summary.json \
 *     --baseline apps/web/coverage-baseline.json \
 *     --root apps/web [--lcov apps/web/coverage/lcov.info --diff /tmp/pr.diff] \
 *     [--enforce]
 */
import fs from 'node:fs';
import process from 'node:process';
import {
  changedLinesCoverage,
  diffCoverage,
  evaluateRatchet,
  parseCoverageReport,
  parseLcov,
  parseUnifiedDiffLines,
  renderReport,
} from './lib.mjs';

function parseArgs(argv) {
  const args = { format: 'istanbul-summary', root: '', enforce: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--enforce') args.enforce = true;
    else if (token === '--report') args.report = argv[++i];
    else if (token === '--baseline') args.baseline = argv[++i];
    else if (token === '--format') args.format = argv[++i];
    else if (token === '--root') args.root = argv[++i];
    else if (token === '--tolerance') args.tolerance = Number(argv[++i]);
    else if (token === '--lcov') args.lcov = argv[++i];
    else if (token === '--diff') args.diff = argv[++i];
    else if (token === '--changed-lines-min') args.changedLinesMin = Number(argv[++i]);
    else if (token === '--label') args.label = argv[++i];
    else throw new Error(`unknown argument: ${token}`);
  }
  return args;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`usage error: ${error.message}`);
    process.exit(2);
  }
  if (!args.report || !args.baseline) {
    console.error('usage: check-coverage-ratchet.mjs --report <file> --baseline <file> [--format ...] [--enforce]');
    process.exit(2);
  }

  let baseline;
  let current;
  try {
    baseline = JSON.parse(fs.readFileSync(args.baseline, 'utf8'));
    current = parseCoverageReport(fs.readFileSync(args.report, 'utf8'), args.format, args.root);
  } catch (error) {
    console.error(`could not read coverage report or baseline: ${error.message}`);
    process.exit(2);
  }

  const tolerance = Number.isFinite(args.tolerance) ? args.tolerance : (baseline.tolerancePct ?? 0);
  const label = args.label ?? baseline.stack ?? 'coverage';
  const diff = diffCoverage(baseline, current, tolerance);

  let changed = null;
  if (args.lcov && args.diff && fs.existsSync(args.lcov) && fs.existsSync(args.diff)) {
    changed = changedLinesCoverage(
      parseLcov(fs.readFileSync(args.lcov, 'utf8'), args.root),
      parseUnifiedDiffLines(fs.readFileSync(args.diff, 'utf8')),
    );
  }

  const changedLinesMinimum = Number.isFinite(args.changedLinesMin)
    ? args.changedLinesMin
    : baseline.changedLinesMinimum ?? baseline?.total?.lines ?? 0;

  console.log(renderReport({ label, diff, tolerance, changed }));

  const verdict = evaluateRatchet({ diff, changed, tolerance, changedLinesMinimum });
  if (verdict.ok) {
    console.log(`[${label}] ratchet OK`);
    return;
  }

  console.log(`[${label}] ratchet violation:\n  - ${verdict.reasons.join('\n  - ')}`);
  if (args.enforce) {
    console.error('Failing: restore coverage (add tests) or refresh the baseline with a documented reason.');
    process.exit(1);
  }
  console.log('report-only: not failing the build (bootstrap phase; see TEST_COVERAGE_ANALYSIS.md)');
}

main();
