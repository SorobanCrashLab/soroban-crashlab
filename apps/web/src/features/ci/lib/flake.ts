/**
 * Deterministic flake scoring (#2314).
 *
 * Every score is derived from observable outcomes — pass↔fail flips, failure
 * rate, recent failures, rerun recoveries and how many code areas a test
 * touches. No randomness, no wall-clock reads inside the scorer: callers pass
 * `nowMs` so the API and vitest see identical output.
 */

import type { CiRun, CiStatus } from './model';
import { normalizeConclusion } from './status';

export interface TestOutcome {
  testId: string;
  name: string;
  runId: string;
  at: string;
  attempt: number;
  status: CiStatus;
  jobName: string;
  codeAreas: string[];
}

export interface FlakeScore {
  testId: string;
  name: string;
  samples: number;
  passes: number;
  failures: number;
  flips: number;
  recentFailures: number;
  recoveries: number;
  codeAreas: string[];
  score: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  isFlaky: boolean;
  lastSeenAt: string;
  lastFailureAt?: string;
  evidence: string[];
}

export interface FlakeOptions {
  nowMs?: number;
  /** Look-back window in ms (default 30 days). */
  windowMs?: number;
  /** Minimum number of outcomes before a test is eligible (default 3). */
  minSamples?: number;
  /** Minimum score included in the leaderboard (default 1). */
  minScore?: number;
}

const DAY_MS = 86_400_000;
const TEST_NAME_PATTERN = /(test|spec|e2e|playwright|vitest|jest|flake)/i;

function isTestStep(name: string): boolean {
  return TEST_NAME_PATTERN.test(name);
}

/** Builds per-test outcomes from run → job → step. Both passes and failures count. */
export function outcomesFromRuns(runs: readonly CiRun[]): TestOutcome[] {
  const outcomes: TestOutcome[] = [];
  for (const run of runs) {
    for (const job of run.jobs) {
      for (const step of job.steps) {
        if (!isTestStep(step.name)) continue;
        const status = normalizeConclusion(step.conclusion, step.status);
        if (status === 'skip' || status === 'pending') continue;
        outcomes.push({
          testId: `${job.workflowName}::${job.name}::${step.name}`,
          name: step.name,
          runId: run.id,
          at: step.completedAt ?? run.updatedAt,
          attempt: run.attempt,
          status,
          jobName: job.name,
          codeAreas: run.codeAreas,
        });
      }
    }
  }
  return outcomes.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.testId.localeCompare(b.testId));
}

function severityFor(score: number): FlakeScore['severity'] {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Scores the history of one test. Pure and deterministic. */
export function scoreFlake(
  testId: string,
  name: string,
  history: readonly TestOutcome[],
  options: FlakeOptions = {},
): FlakeScore {
  const nowMs = options.nowMs ?? Date.now();
  const windowMs = options.windowMs ?? 30 * DAY_MS;
  const minSamples = options.minSamples ?? 3;
  const ordered = [...history].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const cutoff = nowMs - windowMs;
  const inWindow = ordered.filter((outcome) => Date.parse(outcome.at) >= cutoff);
  const failures = ordered.filter((outcome) => outcome.status === 'fail');
  const passes = ordered.filter((outcome) => outcome.status === 'pass');
  const recentFailures = failures.filter((outcome) => Date.parse(outcome.at) >= cutoff).length;

  let flips = 0;
  let recoveries = 0;
  for (let i = 1; i < ordered.length; i += 1) {
    const previous = ordered[i - 1];
    const current = ordered[i];
    if (previous.status !== current.status) flips += 1;
    if (previous.status === 'fail' && current.status === 'pass' && current.attempt > 1) {
      recoveries += 1;
    }
  }

  const n = ordered.length;
  const flipRate = n > 1 ? flips / (n - 1) : 0;
  const failureRate = n > 0 ? failures.length / n : 0;
  const areas = new Set(ordered.flatMap((outcome) => outcome.codeAreas));
  const score = clamp(
    Math.round(
      40 * flipRate +
        25 * failureRate +
        15 * clamp(recentFailures / 3, 0, 1) +
        10 * clamp(recoveries / 3, 0, 1) +
        10 * clamp(areas.size / 3, 0, 1),
    ),
    0,
    100,
  );
  const isFlaky = n >= minSamples && failures.length > 0 && passes.length > 0;
  const evidence = [
    `${flips} pass/fail transition${flips === 1 ? '' : 's'} across ${n} run${n === 1 ? '' : 's'}`,
    `${failures.length} failure${failures.length === 1 ? '' : 's'} (${recentFailures} in the last ${Math.round(windowMs / DAY_MS)} days)`,
    ...(recoveries ? [`${recoveries} pass${recoveries === 1 ? '' : 'es'} after rerun`] : []),
    ...(areas.size ? [`Touches ${areas.size} code area${areas.size === 1 ? '' : 's'}: ${[...areas].sort().join(', ')}`] : []),
  ];

  return {
    testId,
    name,
    samples: n,
    passes: passes.length,
    failures: failures.length,
    flips,
    recentFailures,
    recoveries,
    codeAreas: [...areas].sort(),
    score: isFlaky ? score : 0,
    severity: isFlaky ? severityFor(score) : 'low',
    confidence: clamp(0.4 + n * 0.06, 0, 1),
    isFlaky,
    lastSeenAt: inWindow.at(-1)?.at ?? ordered.at(-1)?.at ?? '',
    lastFailureAt: failures.at(-1)?.at,
    evidence,
  };
}

/** Groups outcomes by test and returns a stable, score-ranked leaderboard. */
export function scoreFlakes(
  outcomes: readonly TestOutcome[],
  options: FlakeOptions = {},
): FlakeScore[] {
  const grouped = new Map<string, TestOutcome[]>();
  for (const outcome of outcomes) {
    const bucket = grouped.get(outcome.testId);
    if (bucket) bucket.push(outcome);
    else grouped.set(outcome.testId, [outcome]);
  }
  const scores = [...grouped].map(([id, history]) =>
    scoreFlake(id, history[0]?.name ?? id, history, options),
  );
  return scores
    .filter((score) => score.isFlaky && score.score >= (options.minScore ?? 1))
    .sort((a, b) => b.score - a.score || a.testId.localeCompare(b.testId));
}

/** Convenience entry point used by the hook and the API route. */
export function flakeLeaderboard(runs: readonly CiRun[], options: FlakeOptions = {}): FlakeScore[] {
  return scoreFlakes(outcomesFromRuns(runs), options);
}
