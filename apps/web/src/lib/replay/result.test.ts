import { describe, expect, it } from 'vitest';
import {
  buildReplayResult,
  replayBundleDownloadName,
  replayIssueHref,
  replayJobHref,
  replayOutcomeLabel,
  replayRunHref,
  type ReplayDiagnostics,
} from './result';
import type { EnvironmentCheck } from './environment';

const diagnostics: ReplayDiagnostics = {
  command: 'cargo',
  args: ['run', '--bin', 'crashlab', '--', 'replay', 'seed', 'bundle.json'],
  stdout: 'replayed 12 seeds',
  stderr: '',
  exitCode: 0,
  durationMs: 842,
};

function environment(overrides: Partial<EnvironmentCheck> = {}): EnvironmentCheck {
  return {
    status: 'match',
    mismatches: [],
    acknowledged: false,
    requiresAcknowledgement: false,
    summary: 'matches',
    ...overrides,
  };
}

describe('replay result', () => {
  it('labels a reproduced crash as a match', () => {
    const result = buildReplayResult({
      sourceRunId: 'run-1',
      replayRunId: 'run-2',
      diagnostics,
      environment: environment(),
      reproduced: true,
    });

    expect(result.outcome).toBe('match');
    expect(replayOutcomeLabel(result)).toBe('Crash reproduced');
    expect(result.ranWithOverride).toBe(false);
  });

  it('labels a non-reproducing run as a mismatch', () => {
    const result = buildReplayResult({
      sourceRunId: 'run-1',
      replayRunId: 'run-2',
      diagnostics: { ...diagnostics, exitCode: 1 },
      environment: environment(),
      reproduced: false,
    });

    expect(result.outcome).toBe('mismatch');
    expect(replayOutcomeLabel(result)).toBe('Crash did not reproduce');
  });

  it('records that an environment override was used', () => {
    const result = buildReplayResult({
      sourceRunId: 'run-1',
      replayRunId: 'run-2',
      diagnostics,
      environment: environment({ status: 'mismatch', acknowledged: true }),
      reproduced: true,
    });
    expect(result.ranWithOverride).toBe(true);
  });

  it('does not call an unacknowledged mismatch an override', () => {
    const result = buildReplayResult({
      sourceRunId: 'run-1',
      replayRunId: 'run-2',
      diagnostics,
      environment: environment({ status: 'mismatch', acknowledged: false }),
      reproduced: true,
    });
    expect(result.ranWithOverride).toBe(false);
  });

  it('builds safe internal links', () => {
    expect(replayRunHref('run 1/2')).toBe('/runs/run%201%2F2');
    expect(replayJobHref('replay-job-1')).toBe('/replay/replay-job-1');
  });

  it('sanitises a bundle download filename', () => {
    expect(replayBundleDownloadName('run-1')).toBe('run-1.replay-bundle.json');
    expect(replayBundleDownloadName('../../etc/passwd')).toBe('.._.._etc_passwd.replay-bundle.json');
    expect(replayBundleDownloadName('')).toBe('run.replay-bundle.json');
    expect(replayBundleDownloadName('x'.repeat(200)).length).toBeLessThanOrEqual(115);
  });

  it('pre-fills an issue with the verdict and fenced diagnostics', () => {
    const result = buildReplayResult({
      sourceRunId: 'run-1',
      replayRunId: 'run-2',
      diagnostics: { ...diagnostics, stderr: '```not a fence```' },
      environment: environment(),
      reproduced: false,
    });

    const href = replayIssueHref(result);
    expect(href.startsWith('https://github.com/SorobanCrashLab/soroban-crashlab/issues/new?')).toBe(
      true,
    );

    const params = new URL(href).searchParams;
    expect(params.get('title')).toContain('not reproduced');
    const body = params.get('body') ?? '';
    expect(body).toContain('Verdict:** Crash did not reproduce');
    expect(body).toContain('```');
    expect(body).toContain('replayed 12 seeds');
  });

  it('truncates an enormous diagnostics tail in the issue body', () => {
    const result = buildReplayResult({
      sourceRunId: 'run-1',
      replayRunId: 'run-2',
      diagnostics: { ...diagnostics, stdout: 'x'.repeat(20_000), stderr: 'y'.repeat(20_000) },
      environment: environment(),
      reproduced: false,
    });
    const href = replayIssueHref(result);
    expect(href.length).toBeLessThan(40_000);
  });
});
