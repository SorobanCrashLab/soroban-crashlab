#!/usr/bin/env node
/**
 * Ops/security/reproducibility docs check (#1896, #1898, #1899).
 *
 *   node scripts/check-runbook-docs.mjs
 *
 * - Every relative Markdown link (path and #anchor) in the checked docs resolves.
 * - Every auto-issue title listed in docs/ops/incident-response.md's
 *   "Signals → playbook" table appears verbatim in a workflow, and every
 *   workflow that opens such an issue links a runbook — so alerts and
 *   runbooks cannot drift apart.
 * External links are not fetched.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  if (fs.statSync(full).isFile()) return [dir];
  return fs.readdirSync(full).flatMap((name) => walk(path.join(dir, name))).filter((f) => f.endsWith('.md'));
}

const FILES = [
  ...walk('docs/ops'),
  ...walk('docs/security'),
  ...walk('docs/self-hosting'),
  'docs/reproducibility-contract.md',
];

function slugify(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');
}

function anchors(file) {
  const out = new Set();
  let fenced = false;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    const m = !fenced && /^#{1,6}\s+(.+?)\s*$/.exec(line);
    if (m) out.add(slugify(m[1]));
  }
  return out;
}

const problems = [];
for (const rel of FILES) {
  const file = path.join(ROOT, rel);
  let fenced = false;
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (/^\s*```/.test(line)) fenced = !fenced;
    if (fenced) return;
    for (const m of line.replace(/`[^`]*`/g, '').matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target = m[1];
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
      const [p, frag] = target.split('#');
      const resolved = p ? path.resolve(path.dirname(file), decodeURIComponent(p)) : file;
      if (!fs.existsSync(resolved)) problems.push(`${rel}:${i + 1}: ${target} does not exist`);
      else if (frag && resolved.endsWith('.md') && !anchors(resolved).has(frag)) {
        problems.push(`${rel}:${i + 1}: ${target} has no heading #${frag}`);
      }
    }
  });
}

const runbook = fs.readFileSync(path.join(ROOT, 'docs/ops/incident-response.md'), 'utf8');
const section = runbook.slice(runbook.indexOf('## Signals'), runbook.indexOf('## Roles'));
const titles = [...section.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]);
const workflows = fs
  .readdirSync(path.join(ROOT, '.github/workflows'))
  .map((name) => [name, fs.readFileSync(path.join(ROOT, '.github/workflows', name), 'utf8')]);
if (titles.length === 0) problems.push('incident-response.md: no auto-issue titles found in "Signals → playbook"');
for (const title of titles) {
  const owner = workflows.find(([, text]) => text.includes(title));
  if (!owner) problems.push(`alert "${title}" is not opened by any workflow`);
  else if (!/docs\/ops\/playbooks\//.test(owner[1])) problems.push(`${owner[0]} opens "${title}" but does not link a runbook`);
}

if (problems.length) {
  console.error(`${problems.length} docs problem(s):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`runbook docs OK: ${FILES.length} files, ${titles.length} alert titles matched to workflows`);
