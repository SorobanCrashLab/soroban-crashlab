#!/usr/bin/env node
/**
 * Compare a mutation report against the committed baseline (issue #1821).
 *
 * Exit codes:
 *   0  no new survivors in critical modules (report-only, or enforced and clean)
 *   1  new critical survivors and `--enforce` was passed
 *   2  usage error / unreadable report or baseline
 *
 * The command is report-only by default: the mutation workflow starts in
 * report-only mode for a week (see docs/testing/mutation-testing.md) and only
 * passes `--enforce` once the baseline is trustworthy.
 *
 * Usage:
 *   node scripts/mutation/check-mutants-baseline.mjs \
 *     --report /tmp/mutants.json \
 *     --baseline contracts/crashlab-core/mutation-baseline.json \
 *     --format cargo-mutants \
 *     [--enforce]
 */
import fs from 'node:fs';
import process from 'node:process';
import {
  criticalNewSurvivors,
  diffSurvivors,
  parseReport,
  renderReport,
} from './lib.mjs';

function parseArgs(argv) {
  const args = { format: 'cargo-mutants', enforce: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--enforce') {
      args.enforce = true;
    } else if (token === '--report') {
      args.report = argv[++i];
    } else if (token === '--baseline') {
      args.baseline = argv[++i];
    } else if (token === '--format') {
      args.format = argv[++i];
    } else {
      throw new Error(`unknown argument: ${token}`);
    }
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
    console.error('usage: check-mutants-baseline.mjs --report <file> --baseline <file> [--format cargo-mutants|stryker] [--enforce]');
    process.exit(2);
  }

  let current;
  let baseline;
  try {
    current = parseReport(fs.readFileSync(args.report, 'utf8'), args.format);
    baseline = JSON.parse(fs.readFileSync(args.baseline, 'utf8'));
  } catch (error) {
    console.error(`could not read mutation report or baseline: ${error.message}`);
    process.exit(2);
  }

  const criticalPatterns = baseline.criticalModules ?? [];
  const survivors = baseline.survivors ?? [];
  const diff = diffSurvivors(survivors, current);

  console.log(renderReport({ ...diff, criticalPatterns }));

  const criticalNew = criticalNewSurvivors(diff.added, criticalPatterns);

  if (criticalNew.length === 0) {
    console.log('mutation gate: OK (no new survivors in critical modules)');
    return;
  }

  console.log(`mutation gate: ${criticalNew.length} new survivor(s) in critical modules`);
  if (args.enforce) {
    console.error(
      'Failing: add a test that kills each survivor, or record it in the baseline with a justification.',
    );
    process.exit(1);
  }
  console.log('report-only: not failing the build (see docs/testing/mutation-testing.md)');
}

main();
