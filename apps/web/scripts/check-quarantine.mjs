#!/usr/bin/env node
/**
 * Quarantine gate for the Playwright e2e suite.
 *
 * Reads e2e/quarantine.json and validates that:
 *   - every entry has a reason, tracking issue and expiry date;
 *   - no entry is expired (expired quarantine is a failure);
 *   - every quarantined spec actually exists on disk (no stale entries).
 *
 * The script also emits a human-readable summary and, when running in CI, a
 * GitHub Step Summary markdown block so the quarantine list is visible on the
 * job page. Use `--json` to print the normalized list for artifact upload.
 *
 * Exit codes:
 *   0  - quarantine is healthy
 *   1  - validation failure (missing field, expired entry, stale spec)
 */
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, '..');
const quarantinePath = resolve(webRoot, 'e2e', 'quarantine.json');
const e2Dir = resolve(webRoot, 'e2e');

const args = new Set(process.argv.slice(2));
const jsonOutput = args.has('--json');
const now = new Date();
const today = now.toISOString().slice(0, 10);

const errors = [];
const warnings = [];

function fail(msg) {
  errors.push(msg);
}

function warn(msg) {
  warnings.push(msg);
}

let raw = '{}';
if (existsSync(quarantinePath)) {
  raw = readFileSync(quarantinePath, 'utf-8');
} else {
  fail(`quarantine file not found: ${quarantinePath}`);
}

let doc;
try {
  doc = JSON.parse(raw);
} catch (err) {
  fail(`quarantine.json is not valid JSON: ${err.message}`);
  doc = { specs: {} };
}

const specs = doc && typeof doc.specs === 'object' && !Array.isArray(doc.specs) ? doc.specs : {};
const entries = Object.entries(specs);
const normalized = [];

for (const [spec, meta] of entries) {
  const prefix = `quarantine[${spec}]`;
  if (!meta || typeof meta !== 'object') {
    fail(`${prefix} must be an object with reason, issue and expiresAt`);
    continue;
  }
  const { reason, issue, expiresAt } = meta;
  if (!reason || typeof reason !== 'string') {
    fail(`${prefix} is missing a reason string`);
  }
  if (!issue || !(/^\w+$/.test(String(issue)) || /^https?:\/\//.test(String(issue)))) {
    fail(`${prefix} issue must be a tracking number or issue URL`);
  }
  if (!expiresAt || !/^\d{4}-\d{2}-\d{2}$/.test(String(expiresAt))) {
    fail(`${prefix} expiresAt must be YYYY-MM-DD; got ${expiresAt}`);
  } else if (String(expiresAt) < today) {
    fail(`${prefix} expired on ${expiresAt} (today is ${today}) - repair or remove the spec`);
  } else {
    const daysLeft = Math.ceil((Date.parse(`${expiresAt}T00:00:00Z`) - now.getTime()) / 86400000);
    if (daysLeft <= 7 && daysLeft >= 0) {
      warn(`${prefix} expires in ${daysLeft} day - repair or remove it soon`);
    }
  }

  const absSpec = resolve(e2Dir, spec);
  if (!existsSync(absSpec)) {
    fail(`${prefix} points at a missing spec: ${spec}`);
  }

  normalized.push({
    spec,
    reason: String(reason ?? ''),
    issue: String(issue ?? ''),
    expiresAt: String(expiresAt ?? ''),
  });
}

const summary = {
  generatedAt: now.toISOString(),
  total: normalized.length,
  entries: normalized,
  errors,
  warnings,
};

if (jsonOutput) {
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
} else {
  if (normalized.length === 0) {
    console.log('Quarantine: empty - all e2e specs are enforced.');
  } else {
    console.log(`Quarantine: ${normalized.length} spec(s) skipped in the e2e gate:`);
    for (const e of normalized) {
      console.log(`  - ${e.spec} (issue ${e.issue}, expires ${e.expiresAt}): ${e.reason}`);
    }
  }
  for (const wag of warnings) console.warn(`warning: ${wag}`);
  for (const err of errors) console.error(`error: ${err}`);
}

// Publish a markdown summary to the GitHub Step Summary when available.
const stepSummary = process.env.GITHUB_STEP_SUMMARY;
if (stepSummary) {
  const lines = [];
  lines.push('## Playwright quarantine');
  if (normalized.length === 0) {
    lines.push('No specs are quarantined. All e2e specs are enforced.');
  } else {
    lines.push('| Spec | Reason | Issue | Expires |');
    lines.push('| --- | --- | --- | --- |');
    for (const e of normalized) {
      lines.push(`| \`${e.spec}\` | ${e.reason} | ${e.issue} | ${e.expiresAt} |`);
    }
  }
  if (warnings.length) {
    lines.push('');
    for (const wag of warnings) lines.push(`> :warning: ${wag}`);
  }
  if (errors.length) {
    lines.push('');
    for (const err of errors) lines.push(`> :x: ${err}`);
  }
  try {
    appendFileSync(stepSummary, '\n' + lines.join('\n') + '\n');
  } catch {
    // Step summary is best-effort; never fail the gate on it.
  }
}

if (errors.length > 0) {
  process.exitCode = 1;
} else {
  process.exitCode = 0;
}
