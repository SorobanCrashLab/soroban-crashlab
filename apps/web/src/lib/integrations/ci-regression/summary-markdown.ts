/**
 * Markdown for the sticky PR regression summary and the check-run output (#1891).
 *
 * Output is a pure function of the result — no timestamps, no locale-dependent
 * formatting — so the golden tests pin it byte for byte and an unchanged run
 * produces an unchanged comment (the upsert then skips the edit).
 */

import { summarizeDeltas } from './classify';
import type { CiRegressionResult, ClassificationDeltas, ClassifiedFixture } from './types';

/** First line of the sticky comment; the upsert finds the comment by it. */
export const STICKY_COMMENT_MARKER = '<!-- crashlab:regression-summary -->';

export const REGRESSION_SUITE_PATH = 'crashlab-core/fixtures/regression_suite.json';
export const REGRESSION_BASELINE_PATH = 'contracts/crashlab-core/regression-baseline.json';
export const REPRO_COMMAND = `cd contracts && cargo run --release --bin crashlab -- regression-suite ${REGRESSION_SUITE_PATH}`;
export const SUMMARY_DOCS_PATH = 'docs/REGRESSION_SUMMARY.md';

/**
 * Neutralises text that comes from fixtures (seed modes, class names, error
 * messages): no table breaks, no HTML, no @-mentions, single line.
 */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\\`*_[\]|<>#]/g, (ch) => `\\${ch}`)
    .replace(/@/g, '@​');
}

function code(text: string): string {
  // Backticks cannot be escaped inside a code span; drop them instead.
  return `\`${text.replace(/`/g, '')}\``;
}

function actualCell(fixture: ClassifiedFixture): string {
  if (fixture.error !== null) return `error: ${escapeMarkdown(fixture.error)}`;
  return escapeMarkdown(fixture.actualClass ?? 'none');
}

function headline(deltas: ClassificationDeltas): string {
  const counts = `${deltas.recurring} recurring · ${deltas.fixed} fixed · ${deltas.unchanged} unchanged`;
  if (deltas.blocking > 0) {
    const noun = deltas.blocking === 1 ? 'new failure' : 'new failures';
    return `:x: **${deltas.blocking} ${noun} (blocking)** · ${counts}`;
  }
  return `:white_check_mark: **No new failures** · ${counts}`;
}

function fixtureTable(fixtures: readonly ClassifiedFixture[]): string[] {
  const lines = ['| Fixture | Expected | Actual |', '|---|---|---|'];
  for (const f of fixtures) {
    const changed = f.baselineSignature !== null ? ` (baseline: ${escapeMarkdown(f.baselineSignature)})` : '';
    lines.push(`| ${code(f.id)} | ${escapeMarkdown(f.expectedClass)} | ${actualCell(f)}${changed} |`);
  }
  return lines;
}

function details(summary: string, body: string[]): string[] {
  return ['<details>', `<summary>${summary}</summary>`, '', ...body, '', '</details>'];
}

function blobUrl(repository: string, path: string): string {
  return `https://github.com/${repository}/blob/main/${path}`;
}

export function buildStickyCommentBody(result: CiRegressionResult): string {
  const deltas = summarizeDeltas(result.fixtures);
  const by = (c: ClassifiedFixture['classification']) => result.fixtures.filter((f) => f.classification === c);
  const blocking = by('new');
  const recurring = by('recurring');
  const fixed = by('fixed');
  const unchanged = by('unchanged');

  const lines: string[] = [
    STICKY_COMMENT_MARKER,
    '## CrashLab regression summary',
    '',
    headline(deltas),
    '',
    '| Classification | Count | Gate |',
    '|---|---:|---|',
    `| New | ${deltas.new} | blocking |`,
    `| Recurring | ${deltas.recurring} | known failure, in baseline |`,
    `| Fixed | ${deltas.fixed} | previously failing, now green |`,
    `| Unchanged | ${deltas.unchanged} | passing |`,
  ];

  if (blocking.length > 0) {
    lines.push('', '### Blocking', '', ...fixtureTable(blocking));
    lines.push('', 'Reproduce locally:', '', '```bash', REPRO_COMMAND, '```');
  }

  if (fixed.length > 0) {
    lines.push('', '### Fixed', '');
    for (const f of fixed) lines.push(`- ${code(f.id)} — remove it from ${code(REGRESSION_BASELINE_PATH)}`);
  }

  if (recurring.length > 0) {
    lines.push('', ...details(`Recurring (${recurring.length})`, fixtureTable(recurring)));
  }

  if (unchanged.length > 0) {
    lines.push('', ...details(`Unchanged (${unchanged.length})`, unchanged.map((f) => `- ${code(f.id)}`)));
  }

  const footer = [`Commit ${code(result.commitSha.slice(0, 7))}`];
  if (result.runUrl) footer.push(`[workflow run](${result.runUrl})`);
  footer.push(`[how to read this summary](${blobUrl(result.repository, SUMMARY_DOCS_PATH)})`);
  footer.push('updated in place on every run');
  lines.push('', '---', `<sub>${footer.join(' · ')}</sub>`, '');

  return lines.join('\n');
}

/** Concise output for the top of the Checks tab (job summary / check run). */
export function buildCheckSummary(result: CiRegressionResult): { title: string; summary: string } {
  const deltas = summarizeDeltas(result.fixtures);
  const title =
    deltas.blocking > 0
      ? `Regression gate: ${deltas.blocking} new ${deltas.blocking === 1 ? 'failure' : 'failures'}`
      : 'Regression gate: no new failures';

  const lines = [
    `### ${title}`,
    '',
    `new ${deltas.new} · recurring ${deltas.recurring} · fixed ${deltas.fixed} · unchanged ${deltas.unchanged}`,
  ];
  const blocking = result.fixtures.filter((f) => f.classification === 'new');
  if (blocking.length > 0) {
    lines.push('', 'Blocking:');
    for (const f of blocking) {
      lines.push(`- ${code(f.id)}: expected ${escapeMarkdown(f.expectedClass)}, got ${actualCell(f)}`);
    }
  }
  lines.push('');
  return { title, summary: lines.join('\n') };
}
