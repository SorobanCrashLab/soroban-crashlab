#!/usr/bin/env node
/**
 * Documentation link check (#1902, #1903).
 *
 *   node scripts/check-doc-links.mjs            check the default doc set
 *   node scripts/check-doc-links.mjs a.md b.md  check specific files
 *
 * Fails when:
 *   - a relative Markdown link, or a github.com/SorobanCrashLab/soroban-crashlab
 *     blob/tree link to `main`, points at a path that does not exist;
 *   - a `#fragment` points at a heading that does not exist in the target file;
 *   - an ADR file in docs/adr/ is missing from the docs/adr/README.md index;
 *   - SECURITY.md and .github/SECURITY.md are not identical.
 * External links are not fetched — CI must not depend on third-party uptime.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_URL = /^https:\/\/github\.com\/SorobanCrashLab\/soroban-crashlab\/(?:blob|tree)\/main\/([^#?]*)(#[^)]*)?$/;

export const DEFAULT_FILES = [
  'README.md',
  'AGENTS.md',
  'SECURITY.md',
  '.github/SECURITY.md',
  'docs/README.md',
  'docs/SECURITY.md',
  'docs/adr/README.md',
  'docs/contributors/architecture.md',
  'docs/contributors/where-to-start.md',
  'docs/security/disclosure.md',
  'docs/releases/policy.md',
  'docs/releases/checklist.md',
  'docs/ops/backup-restore.md',
];

/**
 * Known-broken links that need a maintainer decision, not a docs edit. Each
 * entry is `file:target`; remove it once fixed so the check covers it again.
 */
const KNOWN_BROKEN = new Set([
  // The README states an MIT license but the repository has no LICENSE file.
  // Adding one is a licensing decision for the maintainers.
  'README.md:LICENSE',
]);

/** GitHub's heading → anchor rule (lowercase, drop punctuation, spaces → dashes). */
export function slugify(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');
}

function anchorsOf(file) {
  const anchors = new Set();
  const seen = new Map();
  let fenced = false;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const match = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const base = slugify(match[1]);
    const count = seen.get(base) ?? 0;
    anchors.add(count ? `${base}-${count}` : base);
    seen.set(base, count + 1);
  }
  return anchors;
}

/** Markdown links outside fenced code blocks and inline code. */
export function linksOf(text) {
  const links = [];
  let fenced = false;
  text.split('\n').forEach((line, index) => {
    if (/^\s*```/.test(line)) fenced = !fenced;
    if (fenced) return;
    const withoutCode = line.replace(/`[^`]*`/g, '``');
    for (const match of withoutCode.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      links.push({ target: match[1], line: index + 1 });
    }
  });
  return links;
}

function checkFile(relative, problems) {
  const file = path.join(ROOT, relative);
  if (!fs.existsSync(file)) {
    problems.push(`${relative}: file listed for checking does not exist`);
    return;
  }
  for (const { target, line } of linksOf(fs.readFileSync(file, 'utf8'))) {
    let resolved;
    let fragment;
    const repo = REPO_URL.exec(target);
    if (repo) {
      resolved = path.join(ROOT, decodeURIComponent(repo[1]));
      fragment = repo[2]?.slice(1);
    } else if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
      continue; // external (https:, mailto:, …) — not fetched
    } else {
      const [pathPart, frag] = target.split('#');
      resolved = pathPart ? path.resolve(path.dirname(file), decodeURIComponent(pathPart)) : file;
      fragment = frag;
    }

    if (KNOWN_BROKEN.has(`${relative}:${target}`)) continue;
    const where = `${relative}:${line}`;
    if (!fs.existsSync(resolved)) {
      problems.push(`${where}: ${target} → ${path.relative(ROOT, resolved)} does not exist`);
      continue;
    }
    if (fragment && resolved.endsWith('.md') && !anchorsOf(resolved).has(fragment.toLowerCase())) {
      problems.push(`${where}: ${target} → no heading for #${fragment}`);
    }
  }
}

export function checkAdrIndex(problems) {
  const dir = path.join(ROOT, 'docs/adr');
  const index = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
  for (const adr of fs.readdirSync(dir).filter((name) => /^\d{4}-.*\.md$/.test(name)).sort()) {
    if (!index.includes(`](${adr})`)) problems.push(`docs/adr/README.md: ADR ${adr} is missing from the index`);
  }
}

function checkSecurityMirror(problems) {
  const root = fs.readFileSync(path.join(ROOT, 'SECURITY.md'), 'utf8');
  const mirror = fs.readFileSync(path.join(ROOT, '.github/SECURITY.md'), 'utf8');
  if (root !== mirror) problems.push('SECURITY.md and .github/SECURITY.md differ — copy SECURITY.md over the mirror');
}

const files = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_FILES;
const problems = [];
files.forEach((file) => checkFile(file, problems));
checkAdrIndex(problems);
checkSecurityMirror(problems);

if (problems.length) {
  console.error(`${problems.length} documentation problem(s):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`doc links OK: ${files.length} files, ADR index complete, SECURITY.md mirror in sync`);
