#!/usr/bin/env node
/**
 * Validates the committed quarantine list (issue #1825).
 *
 *   node scripts/flake/check-quarantine.mjs
 *   node scripts/flake/check-quarantine.mjs --fail-on-expired
 *
 * Exits non-zero when the config is malformed (bad policy, missing fields,
 * quarantine window over the cap, duplicate ids). `--fail-on-expired` is used
 * by the nightly run to escalate a quarantine that has run out: an expired
 * entry is meant to be fixed or renewed deliberately, never left in place.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateQuarantine } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    if (key === 'fail-on-expired' || key === 'help') {
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
  console.log('usage: node scripts/flake/check-quarantine.mjs [--config flake-quarantine.json] [--fail-on-expired]');
  process.exit(0);
}

const configPath = path.resolve(ROOT, args.config ?? 'flake-quarantine.json');

/** Prefer a repo-relative path for logs, but never print `../../`. */
function displayPath(absolute) {
  const relative = path.relative(ROOT, absolute);
  return relative.startsWith('..') ? absolute : relative;
}

if (!fs.existsSync(configPath)) {
  console.error(`error: quarantine config not found at ${displayPath(configPath)}`);
  process.exit(1);
}

let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
  console.error(`error: ${displayPath(configPath)} is not valid JSON: ${error.message}`);
  process.exit(1);
}

const { errors, warnings } = validateQuarantine(config, { failOnExpired: args['fail-on-expired'] === true });

for (const warning of warnings) console.log(`warning: ${warning}`);
for (const error of errors) console.error(`error: ${error}`);

if (errors.length > 0) {
  console.error(`\n${errors.length} problem(s) in ${displayPath(configPath)}`);
  process.exit(1);
}

const policy = config.policy ?? {};
console.log(
  `quarantine config OK: ${config.quarantined.length} entr(ies), ` +
    `threshold ${policy.flakyRateThreshold}%, window ${policy.windowRuns} runs, ` +
    `cap ${policy.maxQuarantineDays}d`,
);
