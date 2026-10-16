// node --test scripts/release/*.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MARKER_END, MARKER_START, parseLog, renderChangelog, writeGeneratedSection } from './changelog.mjs';

const F = '\x1f';
const R = '\x1e';
const log = [
  [`${'a'.repeat(40)}`, 'feat(web): add audit export', ''],
  [`${'b'.repeat(40)}`, 'fix: handle empty corpus', ''],
  [`${'c'.repeat(40)}`, 'feat(core)!: drop v1 bundle reader', ''],
  [`${'d'.repeat(40)}`, 'refactor(api): split routes', 'Body text.\n\nBREAKING CHANGE: /api/runs now paginates\nby cursor.'],
  [`${'e'.repeat(40)}`, 'Fix e2e hang on CI', ''],
  [`${'f'.repeat(40)}`, 'fix: handle empty corpus', ''],
  [`${'1'.repeat(40)}`, 'wip: something', ''],
]
  .map((fields) => `\n${fields.join(F)}${R}`)
  .join('');

test('parses types, scopes and both breaking-change forms', () => {
  const commits = parseLog(log);
  assert.equal(commits.length, 7);
  assert.deepEqual(commits[0], {
    sha: 'a'.repeat(40), type: 'feat', scope: 'web', subject: 'add audit export', breaking: false, breakingNote: null,
  });
  assert.equal(commits[2].breaking, true);
  assert.equal(commits[3].breaking, true);
  assert.equal(commits[3].breakingNote, '/api/runs now paginates by cursor.');
  assert.equal(commits[4].type, null);
  assert.equal(commits[6].type, null, 'unknown types are not conventional');
});

test('renders grouped, breaking first, deduplicated and deterministic', () => {
  const commits = parseLog(log);
  const text = renderChangelog(commits, { title: 'v0.3.0 - 2026-10-16', repo: 'o/r' });
  assert.equal(text, renderChangelog(parseLog(log), { title: 'v0.3.0 - 2026-10-16', repo: 'o/r' }));

  const headings = text.split('\n').filter((l) => l.startsWith('#'));
  assert.deepEqual(headings, [
    '## v0.3.0 - 2026-10-16',
    '### ⚠ Breaking changes',
    '### Features',
    '### Fixes',
    '### Refactoring',
    '### Other changes (non-conventional subjects)',
  ]);
  assert.equal(text.match(/handle empty corpus/g).length, 1);
  assert.match(text, /- \*\*core:\*\* drop v1 bundle reader \(\[ccccccc\]\(https:\/\/github.com\/o\/r\/commit\/c{40}\)\)/);
  assert.match(text, /split routes .* — \/api\/runs now paginates by cursor\./);
});

test('writes and rewrites only the generated block', () => {
  const base = '# Changelog\n\n## Unreleased\n\n- manual note\n\n## v0.1.0\n\n- old\n';
  const once = writeGeneratedSection(base, '## Since v0.2.0\n\n- a\n');
  assert.ok(once.includes('- manual note'));
  assert.ok(once.indexOf(MARKER_START) < once.indexOf('## v0.1.0'));
  const twice = writeGeneratedSection(once, '## Since v0.2.0\n\n- b\n');
  assert.ok(twice.includes('- b') && !twice.includes('- a\n'));
  assert.equal(twice.split(MARKER_START).length, 2);
  assert.equal(twice.split(MARKER_END).length, 2);
});
