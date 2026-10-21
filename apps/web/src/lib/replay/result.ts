/**
 * lib/replay/result — the artifact a finished replay leaves behind (#1876).
 *
 * A replay ends in one of two useful answers: the signature matched (the crash
 * reproduced) or it did not. Everything else — exit code, stdout, command — is
 * diagnostics. Keeping the verdict separate from the diagnostics is what lets
 * the result page put one sentence above the fold and push the raw output into
 * a collapsible block.
 */

import type { EnvironmentCheck } from './environment';

export interface ReplayDiagnostics {
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface ReplayResult {
  sourceRunId: string;
  replayRunId: string;
  outcome: 'match' | 'mismatch';
  diagnostics: ReplayDiagnostics;
  environment: EnvironmentCheck;
  /** True when the caller ran despite an environment mismatch. */
  ranWithOverride: boolean;
}

export interface BuildReplayResultInput {
  sourceRunId: string;
  replayRunId: string;
  diagnostics: ReplayDiagnostics;
  environment: EnvironmentCheck;
  /** Whether the replayed signature equalled the original. */
  reproduced: boolean;
}

export function buildReplayResult(input: BuildReplayResultInput): ReplayResult {
  return {
    sourceRunId: input.sourceRunId,
    replayRunId: input.replayRunId,
    outcome: input.reproduced ? 'match' : 'mismatch',
    diagnostics: input.diagnostics,
    environment: input.environment,
    ranWithOverride: input.environment.status === 'mismatch' && input.environment.acknowledged,
  };
}

/** One-line verdict for the result banner. */
export function replayOutcomeLabel(result: ReplayResult): string {
  if (result.outcome === 'match') return 'Crash reproduced';
  return 'Crash did not reproduce';
}

/** Where the replay's own run lives, when the caller wants the full trace. */
export function replayRunHref(replayRunId: string): string {
  return `/runs/${encodeURIComponent(replayRunId)}`;
}

/** Canonical link to the replay result page. */
export function replayJobHref(jobId: string): string {
  return `/replay/${encodeURIComponent(jobId)}`;
}

/** Filename suggestion for downloading the bundle that was replayed. */
export function replayBundleDownloadName(runId: string): string {
  const safe = runId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 96) || 'run';
  return `${safe}.replay-bundle.json`;
}

const REPO_ISSUES_URL = 'https://github.com/SorobanCrashLab/soroban-crashlab/issues/new';

function trimForIssue(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}\n… (truncated)` : trimmed;
}

/**
 * Pre-filled "report this replay" link. The body is fenced so pasted stderr
 * cannot break the issue template, and it is truncated so a huge trace does not
 * exceed GitHub's URL limits.
 */
export function replayIssueHref(result: ReplayResult): string {
  const title = `[replay] ${result.outcome === 'match' ? 'reproduced' : 'not reproduced'}: ${result.sourceRunId}`;
  const body = [
    `Replay \`${result.replayRunId}\` of run \`${result.sourceRunId}\`.`,
    '',
    `**Verdict:** ${replayOutcomeLabel(result)}`,
    `**Environment:** ${result.environment.status}${result.ranWithOverride ? ' (override acknowledged)' : ''}`,
    `**Command:** \`${result.diagnostics.command} ${result.diagnostics.args.join(' ')}\``,
    `**Exit code:** ${result.diagnostics.exitCode} · **Duration:** ${result.diagnostics.durationMs}ms`,
    '',
    '<details><summary>stdout</summary>',
    '',
    '```',
    trimForIssue(result.diagnostics.stdout, 4_000),
    '```',
    '',
    '</details>',
    '',
    '<details><summary>stderr</summary>',
    '',
    '```',
    trimForIssue(result.diagnostics.stderr, 4_000),
    '```',
    '',
    '</details>',
  ].join('\n');

  const params = new URLSearchParams({ title, body: trimForIssue(body, 8_000) });
  return `${REPO_ISSUES_URL}?${params.toString()}`;
}
