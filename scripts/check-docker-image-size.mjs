#!/usr/bin/env node
/**
 * Docker image size budget gate (#1829).
 *
 *   node scripts/check-docker-image-size.mjs --measured sizes.json \
 *     --budget .github/docker-image-budget.json [--base-budget base.json]
 *   node scripts/check-docker-image-size.mjs --self-test
 *
 * Two checks, both hard failures:
 *
 *   1. Absolute: the measured image / standalone payload must fit the budget
 *      in .github/docker-image-budget.json. This is the gate that catches the
 *      "the image quietly grew to 2GB" regression.
 *   2. Ratchet: the committed budget may not exceed what the base branch
 *      carries, so the ceiling only moves down. The one escape hatch is an
 *      updated `ratchetJustification` string in the budget file — a raise has
 *      to be written down, and because the comparison is against the base
 *      branch's string, every later raise needs a fresh justification rather
 *      than a stale copy.
 *
 * Measurements come from the workflow (docker image inspect + du over /app),
 * not from this script, so the script stays runnable offline: --self-test
 * exercises every branch without Docker.
 */

import fs from 'node:fs';

const BUDGET_KEYS = ['imageMaxBytes', 'standaloneMaxBytes'];
const LABELS = {
  imageBytes: 'image',
  standaloneBytes: 'standalone payload',
};

export function formatBytes(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${bytes} B`;
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function validateBudget(budget) {
  const errors = [];
  if (!budget || typeof budget !== 'object') {
    return ['budget must be a JSON object'];
  }
  for (const key of BUDGET_KEYS) {
    const value = budget[key];
    if (!Number.isInteger(value) || value <= 0) {
      errors.push(`${key} must be a positive integer of bytes (got ${JSON.stringify(value)})`);
    }
  }
  return errors;
}

export function validateMeasured(measured) {
  const errors = [];
  if (!measured || typeof measured !== 'object') {
    return ['measurement must be a JSON object'];
  }
  for (const key of Object.keys(LABELS)) {
    const value = measured[key];
    if (!Number.isInteger(value) || value <= 0) {
      errors.push(`${key} must be a positive integer of bytes (got ${JSON.stringify(value)})`);
    }
  }
  return errors;
}

/** Absolute gate: measured must fit inside the committed budget. */
export function checkAgainstBudget(measured, budget) {
  const errors = [];
  for (const [measuredKey, budgetKey] of [
    ['imageBytes', 'imageMaxBytes'],
    ['standaloneBytes', 'standaloneMaxBytes'],
  ]) {
    const actual = measured[measuredKey];
    const max = budget[budgetKey];
    if (actual > max) {
      const over = actual - max;
      errors.push(
        `${LABELS[measuredKey]} is ${formatBytes(actual)}, over the ${formatBytes(max)} ` +
          `budget (${budgetKey}) by ${formatBytes(over)} — trim the Dockerfile/` +
          `dependency output or, if the growth is intentional, raise ` +
          `${budgetKey} with an updated ratchetJustification and maintainer sign-off.`,
      );
    }
  }
  return errors;
}

/** Ratchet gate: budgets may only shrink unless the raise is justified. */
export function checkRatchet(budget, baseBudget) {
  const errors = [];
  const warnings = [];
  if (!baseBudget) return { errors, warnings };

  const justification = typeof budget.ratchetJustification === 'string'
    ? budget.ratchetJustification.trim()
    : '';
  const baseJustification = typeof baseBudget.ratchetJustification === 'string'
    ? baseBudget.ratchetJustification.trim()
    : '';

  for (const key of BUDGET_KEYS) {
    const next = budget[key];
    const base = baseBudget[key];
    if (!Number.isInteger(base)) continue;
    if (next > base) {
      if (!justification || justification === baseJustification) {
        errors.push(
          `${key} raised from ${formatBytes(base)} to ${formatBytes(next)}. Size budgets ` +
            `ratchet downward: if the increase is intentional, set a fresh ` +
            `\`ratchetJustification\` in the budget file describing why, and get ` +
            `maintainer sign-off on it in the PR.`,
        );
      } else {
        warnings.push(
          `${key} raised from ${formatBytes(base)} to ${formatBytes(next)} — justified by ` +
            `\`ratchetJustification\`: ${justification}`,
        );
      }
    } else if (next < base) {
      warnings.push(`${key} ratcheted down from ${formatBytes(base)} to ${formatBytes(next)}.`);
    }
  }
  return { errors, warnings };
}

export function headroom(actual, max) {
  const pct = ((max - actual) / max) * 100;
  return pct >= 0 ? `${pct.toFixed(0)}% headroom` : `${Math.abs(pct).toFixed(0)}% over`;
}

function emit(lines) {
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) fs.appendFileSync(summary, `${lines.join('\n')}\n`);
}

function fail(messages) {
  const inActions = process.env.GITHUB_ACTIONS === 'true';
  for (const message of messages) {
    process.stderr.write(`${inActions ? '::error::' : 'error: '}${message}\n`);
  }
  process.exitCode = 1;
}

function summarize(measured, budget, warnings) {
  const rows = [
    '| metric | measured | budget | status |',
    '| --- | --- | --- | --- |',
    `| image | ${formatBytes(measured.imageBytes)} | ${formatBytes(budget.imageMaxBytes)} | ${headroom(measured.imageBytes, budget.imageMaxBytes)} |`,
    `| standalone payload | ${formatBytes(measured.standaloneBytes)} | ${formatBytes(budget.standaloneMaxBytes)} | ${headroom(measured.standaloneBytes, budget.standaloneMaxBytes)} |`,
  ];
  emit(['### Docker image size budget', '', ...rows, ...warnings.map((w) => `- ${w}`)]);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--self-test') args.selfTest = true;
    else if (token === '--measured') args.measured = argv[++i];
    else if (token === '--budget') args.budget = argv[++i];
    else if (token === '--base-budget') args.baseBudget = argv[++i];
    else args._.push(token);
  }
  return args;
}

function selfTest() {
  const budget = { imageMaxBytes: 1000, standaloneMaxBytes: 500 };
  const within = { imageBytes: 999, standaloneBytes: 500 };
  const over = { imageBytes: 1001, standaloneBytes: 500 };
  const checks = [
    ['clean measurement passes', checkAgainstBudget(within, budget).length === 0],
    ['image over budget fails', checkAgainstBudget(over, budget).length === 1],
    [
      'standalone over budget fails',
      checkAgainstBudget({ imageBytes: 1, standaloneBytes: 501 }, budget).length === 1,
    ],
    ['no base budget skips ratchet', checkRatchet(budget, null).errors.length === 0],
    ['equal budget is not a raise', checkRatchet(budget, budget).errors.length === 0],
    [
      'unjustified raise fails',
      checkRatchet({ ...budget, imageMaxBytes: 2000 }, budget).errors.length === 1,
    ],
    [
      'stale justification does not excuse a raise',
      checkRatchet(
        { ...budget, imageMaxBytes: 2000, ratchetJustification: 'because' },
        { ...budget, ratchetJustification: 'because' },
      ).errors.length === 1,
    ],
    [
      'fresh justification warns instead of failing',
      checkRatchet(
        { ...budget, imageMaxBytes: 2000, ratchetJustification: 'new feature needs room' },
        budget,
      ).errors.length === 0,
    ],
    [
      'lowering the budget warns but passes',
      checkRatchet({ ...budget, imageMaxBytes: 900 }, budget).errors.length === 0,
    ],
    ['rejects non-integer budget', validateBudget({ imageMaxBytes: 'x', standaloneMaxBytes: 1 }).length === 1],
    [
      'rejects non-integer measurement',
      validateMeasured({ imageBytes: 0, standaloneBytes: 10 }).length === 1,
    ],
    ['formats bytes', formatBytes(2 * 1024 * 1024 * 1024) === '2.00 GB'],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  for (const [name] of failed) process.stderr.write(`self-test failed: ${name}\n`);
  if (failed.length > 0) process.exitCode = 1;
  else console.log(`docker image size gate self-test passed (${checks.length} checks)`);
}

function main() {
  try {
    return run(parseArgs(process.argv.slice(2)));
  } catch (error) {
    fail([error instanceof Error ? error.message : String(error)]);
  }
}

function run(args) {
  if (args.selfTest) return selfTest();
  if (!args.measured || !args.budget) {
    process.stderr.write(
      'usage: check-docker-image-size.mjs --measured sizes.json --budget budget.json ' +
        '[--base-budget base.json] | --self-test\n',
    );
    process.exitCode = 2;
    return;
  }

  const budget = readJson(args.budget);
  const measured = readJson(args.measured);
  const baseBudget = args.baseBudget ? readJson(args.baseBudget) : null;

  const errors = [...validateBudget(budget), ...validateMeasured(measured)];
  if (errors.length > 0) return fail(errors);

  const ratchet = checkRatchet(budget, baseBudget);
  const budgetErrors = checkAgainstBudget(measured, budget);
  const allErrors = [...budgetErrors, ...ratchet.errors];

  summarize(measured, budget, [...allErrors, ...ratchet.warnings]);
  if (allErrors.length > 0) return fail(allErrors);
  console.log(
    `size gate passed: image ${formatBytes(measured.imageBytes)} / ` +
      `${formatBytes(budget.imageMaxBytes)}, standalone ` +
      `${formatBytes(measured.standaloneBytes)} / ${formatBytes(budget.standaloneMaxBytes)}`,
  );
}

main();
