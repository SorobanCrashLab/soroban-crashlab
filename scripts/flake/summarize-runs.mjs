#!/usr/bin/env node
/**
 * Aggregates repeated test attempts into a flake report (issue #1825).
 *
 *   node scripts/flake/summarize-runs.mjs --attempts-dir flake-attempts \
 *     --threshold 5 --window 20 --stack web \
 *     --out flake-report.json --markdown flake-report.md
 *
 * Each `--attempts-dir` entry is a Playwright `results.json` (one per attempt,
 * named `attempt-*.json`). A test that fails in one attempt and passes in
 * another is *flaky*, not green: it is ranked by disagreement rate and, when
 * it exceeds the threshold, a quarantine entry is proposed with an expiry
 * capped at the policy maximum.
 *
 * Emits the machine-readable report, a Markdown summary for the job summary /
 * PR comment, and (optionally) the proposed quarantine entries. Exit code is 0
 * unless `--fail-on-flaky` is passed and flaky tests were found.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  aggregateAttempts,
  buildReport,
  extractSpecOutcomes,
  POLICY_DEFAULTS,
  proposeQuarantine,
  renderMarkdown,
} from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    if (key === 'fail-on-flaky' || key === 'help') {
      args[key] = true;
    } else {
      args[key] = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(
    'usage: node scripts/flake/summarize-runs.mjs [--attempts-dir DIR] [--threshold N] [--window N]' +
      ' [--stack web|rust] [--out FILE] [--markdown FILE] [--quarantine-out FILE] [--fail-on-flaky]',
  );
  process.exit(0);
}

const threshold = args.threshold !== undefined ? Number(args.threshold) : POLICY_DEFAULTS.flakyRateThreshold;
const windowRuns = args.window !== undefined ? Number(args.window) : POLICY_DEFAULTS.windowRuns;
const attemptsDir = path.resolve(ROOT, args['attempts-dir'] ?? 'flake-attempts');
const stack = args.stack ?? 'web';

const attemptFiles = fs.existsSync(attemptsDir)
  ? fs
      .readdirSync(attemptsDir)
      .filter((name) => /^attempt-.*\.json$/.test(name))
      .sort()
      .map((name) => path.join(attemptsDir, name))
  : [];

if (attemptFiles.length === 0) {
  console.log(`No attempt artifacts found in ${path.relative(ROOT, attemptsDir)}; nothing to summarize.`);
  process.exit(0);
}

const attemptOutcomeLists = attemptFiles.map((file) => {
  try {
    return extractSpecOutcomes(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (error) {
    console.log(`Skipping unreadable attempt ${path.basename(file)}: ${error.message}`);
    return [];
  }
});

const aggregated = aggregateAttempts(attemptOutcomeLists);
const quarantined = proposeQuarantine(aggregated, threshold, {
  stack,
  maxQuarantineDays: POLICY_DEFAULTS.maxQuarantineDays,
  days: POLICY_DEFAULTS.maxQuarantineDays,
});

const report = buildReport({
  aggregated,
  threshold,
  windowRuns,
  attemptsCount: attemptFiles.length,
  quarantined,
});

const outPath = path.resolve(ROOT, args.out ?? 'flake-report.json');
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

/** Prefer a repo-relative path for logs, but never print `../../`. */
function displayPath(absolute) {
  const relative = path.relative(ROOT, absolute);
  return relative.startsWith('..') ? absolute : relative;
}

const markdown = renderMarkdown(report);
if (args.markdown) {
  fs.writeFileSync(path.resolve(ROOT, args.markdown), markdown);
}
if (args['quarantine-out'] && quarantined.length > 0) {
  fs.writeFileSync(
    path.resolve(ROOT, args['quarantine-out']),
    `${JSON.stringify({ policy: { flakyRateThreshold: threshold, windowRuns, maxQuarantineDays: POLICY_DEFAULTS.maxQuarantineDays }, quarantined }, null, 2)}\n`,
  );
}

process.stdout.write(markdown);
console.log(`Report written to ${displayPath(outPath)}`);

if (args['fail-on-flaky'] === true && quarantined.length > 0) {
  console.error(`${quarantined.length} test(s) exceeded the ${threshold}% flake threshold`);
  process.exit(1);
}
