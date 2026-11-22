#!/usr/bin/env node
/**
 * Changelog generation from conventional commits (#1901).
 *
 *   node scripts/release/changelog.mjs --from v0.2.0 [--to HEAD] [--version v0.3.0] [--date 2026-10-16]
 *   node scripts/release/changelog.mjs --from v0.2.0 --to <sha> --title "…" --write CHANGELOG.md
 *
 * Deterministic: the output depends only on the commit range and the flags —
 * no clock reads (pass --date), no network. Merge commits are skipped; their
 * content arrives through the merged commits. Identical subjects (cherry-picks,
 * re-landed PRs) are listed once.
 *
 * Breaking changes: `type!:` / `type(scope)!:` subjects and `BREAKING CHANGE:`
 * (or `BREAKING-CHANGE:`) footers. They are listed first and also stay in
 * their type group.
 *
 * --write replaces the block between the generated-section markers in the
 * target file (inserting it after `## Unreleased`'s section if absent).
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const GROUPS = [
  ['feat', 'Features'],
  ['fix', 'Fixes'],
  ['perf', 'Performance'],
  ['revert', 'Reverts'],
  ['refactor', 'Refactoring'],
  ['docs', 'Documentation'],
  ['build', 'Build'],
  ['ci', 'CI'],
  ['test', 'Tests'],
  ['style', 'Style'],
  ['chore', 'Chores'],
];
const KNOWN = new Set(GROUPS.map(([type]) => type));
const FIELD = '\x1f';
const RECORD = '\x1e';

export const MARKER_START = '<!-- changelog:generated:start -->';
export const MARKER_END = '<!-- changelog:generated:end -->';

const SUBJECT = /^([a-z]+)(?:\(([^)]+)\))?(!)?: (.+)$/;
const BREAKING_FOOTER = /(?:^|\n)BREAKING[ -]CHANGE: ?([\s\S]+?)(?=\n\n|$)/;

export function readCommits(from, to = 'HEAD') {
  const raw = execFileSync(
    'git',
    ['log', '--no-merges', '--topo-order', `--format=%H${FIELD}%s${FIELD}%b${RECORD}`, `${from}..${to}`],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return parseLog(raw);
}

/** Parses `git log` output in the format above; newest first, as git emits it. */
export function parseLog(raw) {
  return raw
    .split(RECORD)
    .map((record) => record.replace(/^\n+/, ''))
    .filter(Boolean)
    .map((record) => {
      const [sha, subject = '', body = ''] = record.split(FIELD);
      const match = SUBJECT.exec(subject.trim());
      const footer = BREAKING_FOOTER.exec(body);
      const type = match && KNOWN.has(match[1]) ? match[1] : null;
      return {
        sha: sha.trim(),
        type,
        scope: type ? (match[2] ?? null) : null,
        subject: type ? match[4].trim() : subject.trim(),
        breaking: type ? Boolean(match[3]) || Boolean(footer) : Boolean(footer),
        breakingNote: footer ? footer[1].trim().replace(/\s+/g, ' ') : null,
      };
    });
}

function dedupe(commits) {
  const seen = new Set();
  return commits.filter((commit) => {
    const key = `${commit.type}|${commit.scope}|${commit.subject.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function line(commit, repo) {
  const sha = commit.sha.slice(0, 7);
  const ref = repo ? `[${sha}](https://github.com/${repo}/commit/${commit.sha})` : sha;
  const scope = commit.scope ? `**${commit.scope}:** ` : '';
  return `- ${scope}${commit.subject} (${ref})`;
}

export function renderChangelog(commits, { title, repo } = {}) {
  const unique = dedupe(commits);
  const out = [`## ${title}`, ''];

  const breaking = unique.filter((commit) => commit.breaking);
  if (breaking.length) {
    out.push('### ⚠ Breaking changes', '');
    for (const commit of breaking) {
      out.push(line(commit, repo) + (commit.breakingNote ? ` — ${commit.breakingNote}` : ''));
    }
    out.push('');
  }

  for (const [type, heading] of GROUPS) {
    const group = unique.filter((commit) => commit.type === type);
    if (!group.length) continue;
    out.push(`### ${heading}`, '', ...group.map((commit) => line(commit, repo)), '');
  }

  const other = unique.filter((commit) => commit.type === null);
  if (other.length) {
    out.push('### Other changes (non-conventional subjects)', '', ...other.map((commit) => line(commit, repo)), '');
  }
  return `${out.join('\n').trimEnd()}\n`;
}

export function writeGeneratedSection(fileText, section) {
  const block = `${MARKER_START}\n${section}${MARKER_END}`;
  const start = fileText.indexOf(MARKER_START);
  const end = fileText.indexOf(MARKER_END);
  if (start >= 0 && end > start) {
    return fileText.slice(0, start) + block + fileText.slice(end + MARKER_END.length);
  }
  // Insert before the first release heading after `## Unreleased`, or append.
  const unreleased = fileText.indexOf('\n## Unreleased');
  const next = unreleased >= 0 ? fileText.indexOf('\n## ', unreleased + 1) : -1;
  if (next >= 0) return `${fileText.slice(0, next + 1)}${block}\n\n${fileText.slice(next + 1)}`;
  return `${fileText.trimEnd()}\n\n${block}\n`;
}

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const from = arg('from');
  if (!from) {
    console.error('usage: changelog.mjs --from <ref> [--to <ref>] [--version vX.Y.Z --date YYYY-MM-DD | --title T] [--repo o/r] [--write FILE]');
    process.exit(2);
  }
  const to = arg('to') ?? 'HEAD';
  const version = arg('version');
  const title = arg('title') ?? (version ? `${version}${arg('date') ? ` - ${arg('date')}` : ''}` : `Changes since ${from}`);
  const section = renderChangelog(readCommits(from, to), {
    title,
    repo: arg('repo') ?? 'SorobanCrashLab/soroban-crashlab',
  });

  const target = arg('write');
  if (target) {
    fs.writeFileSync(target, writeGeneratedSection(fs.readFileSync(target, 'utf8'), section));
  } else {
    process.stdout.write(section);
  }
}
