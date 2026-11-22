#!/usr/bin/env node
/**
 * Threat model traceability check (#1897).
 *
 *   node scripts/check-threat-model.mjs [--offline]
 *
 * For docs/security/threat-model-v2.md:
 *   - at least 15 abuse cases (rows starting `| AC-`);
 *   - every abuse case cites evidence: an existing file in backticks and/or an
 *     issue reference (#NNNN); `M` (mitigated) rows must cite a file;
 *   - every cited file exists;
 *   - every `tN_` test group in contracts/crashlab-core/src/threat_model_tests.rs
 *     is mapped in the model's "Code-side tests → model" table;
 *   - every #NNNN in the document resolves to an issue or PR on GitHub
 *     (uses GITHUB_TOKEN when set; --offline skips this step).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODEL = 'docs/security/threat-model-v2.md';
const TESTS = 'contracts/crashlab-core/src/threat_model_tests.rs';
const REPO = process.env.GITHUB_REPOSITORY || 'SorobanCrashLab/soroban-crashlab';
const offline = process.argv.includes('--offline');

const text = fs.readFileSync(path.join(ROOT, MODEL), 'utf8');
const problems = [];

const rows = text.split('\n').filter((line) => line.startsWith('| AC-'));
if (rows.length < 15) problems.push(`only ${rows.length} abuse cases; the model requires at least 15`);

for (const row of rows) {
  const cells = row.split('|').map((cell) => cell.trim());
  const [id, status, evidence] = [cells[1], cells[6], cells[7] ?? ''];
  const files = [...evidence.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const issues = [...evidence.matchAll(/#(\d+)/g)];
  if (!files.length && !issues.length) problems.push(`${id}: no evidence (test file or issue)`);
  if (status === 'M' && !files.length) problems.push(`${id}: marked mitigated but cites no test file`);
  for (const file of files) {
    if (!fs.existsSync(path.join(ROOT, file))) problems.push(`${id}: cited file ${file} does not exist`);
  }
}

const groups = new Set([...fs.readFileSync(path.join(ROOT, TESTS), 'utf8').matchAll(/fn (t\d+)_/g)].map((m) => m[1]));
for (const group of groups) {
  if (!text.includes(`\`${group}_*\``)) problems.push(`${TESTS}: test group ${group}_* is not mapped in the model`);
}

const referenced = [...new Set([...text.matchAll(/(?<![\w/])#(\d{2,6})\b/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
if (offline) {
  console.log(`offline: skipped resolving ${referenced.length} issue references`);
} else {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'crashlab-threat-model-check' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  for (const number of referenced) {
    const response = await fetch(`https://api.github.com/repos/${REPO}/issues/${number}`, { headers });
    if (response.status === 404) problems.push(`#${number} does not exist in ${REPO}`);
    else if (!response.ok) problems.push(`#${number}: GitHub API responded ${response.status} (rate limit? set GITHUB_TOKEN)`);
  }
}

if (problems.length) {
  console.error(`${problems.length} threat model problem(s):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`threat model OK: ${rows.length} abuse cases, ${groups.size} test groups mapped, ${referenced.length} issue refs${offline ? ' (not resolved)' : ' resolved'}`);
