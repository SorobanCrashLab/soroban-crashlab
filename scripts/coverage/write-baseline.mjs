#!/usr/bin/env node
/**
 * Regenerate a coverage baseline from a measured report (issue #1822).
 *
 * Run after a green coverage job to refresh the committed baseline:
 *
 *   node scripts/coverage/write-baseline.mjs \
 *     --format lcov --report apps/web/coverage/lcov.info --root apps/web \
 *     --stack web --tool "vitest (istanbul v8)" --out apps/web/coverage-baseline.json
 *
 * The output is stable: files are sorted, so regenerating an unchanged report
 * is a no-op diff.
 */
import fs from 'node:fs';
import process from 'node:process';
import { buildBaseline, parseCoverageReport } from './lib.mjs';

function parseArgs(argv) {
  const args = { format: 'lcov', root: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--report') args.report = argv[++i];
    else if (token === '--out') args.out = argv[++i];
    else if (token === '--format') args.format = argv[++i];
    else if (token === '--root') args.root = argv[++i];
    else if (token === '--stack') args.stack = argv[++i];
    else if (token === '--tool') args.tool = argv[++i];
    else if (token === '--tolerance') args.tolerance = Number(argv[++i]);
    else if (token === '--changed-lines-min') args.changedMin = Number(argv[++i]);
    else throw new Error(`unknown argument: ${token}`);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!args.report || !args.out) {
  console.error('usage: write-baseline.mjs --report <file> --out <file> [--format lcov] [--root <dir>] [--stack <name>] [--tool <name>]');
  process.exit(2);
}

const current = parseCoverageReport(fs.readFileSync(args.report, 'utf8'), args.format, args.root);
const baseline = buildBaseline(current, {
  stack: args.stack,
  tool: args.tool,
  tolerancePct: Number.isFinite(args.tolerance) ? args.tolerance : 1,
  changedLinesMinimum: Number.isFinite(args.changedMin) ? args.changedMin : 60,
});

fs.writeFileSync(args.out, `${JSON.stringify(baseline, null, 2)}\n`);
console.log(`wrote ${args.out}: total ${baseline.total.lines}%, ${Object.keys(baseline.files).length} file(s)`);
