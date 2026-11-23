/**
 * Status normalization for GitHub-Actions-like conclusions (#2314).
 *
 * Providers disagree on vocabulary and on what a rerun means. All consumers of
 * this feature see one of five statuses; the rules below are deliberately
 * explicit so a new provider conclusion can be added with a test.
 */

import { CI_STATUSES, runGroupKey, type CiCheck, type CiRun, type CiStatus } from './model';

const ACTIVE_STATUSES = new Set(['queued', 'in_progress', 'waiting', 'pending', 'requested']);

const CONCLUSION_MAP: Record<string, CiStatus> = {
  success: 'pass',
  successful: 'pass',
  passed: 'pass',
  neutral: 'warn',
  action_required: 'warn',
  failure: 'fail',
  failed: 'fail',
  timed_out: 'fail',
  startup_failure: 'fail',
  stale: 'fail',
  error: 'fail',
  cancelled: 'skip',
  canceled: 'skip',
  skipped: 'skip',
  not_applicable: 'skip',
  // Haskell-style CI names seen in webhook payloads.
  skipped_due_to_previous_job: 'skip',
};

/**
 * Maps a raw conclusion to the shared status vocabulary.
 * A `null` conclusion means "no result yet" for active runs and "no check ran"
 * for completed runs; callers can distinguish via the second argument.
 */
export function normalizeConclusion(
  conclusion: string | null | undefined,
  status?: string | null,
): CiStatus {
  const value = (conclusion ?? '').toLowerCase().trim();
  if (CONCLUSION_MAP[value]) return CONCLUSION_MAP[value];
  if (value === '' || value === 'null') {
    return status && ACTIVE_STATUSES.has(status.toLowerCase()) ? 'pending' : 'skip';
  }
  // Unknown conclusions are surfaced as warnings rather than silently passing.
  return 'warn';
}

/** A required check that did not pass is a blocking failure, even when skipped/cancelled. */
export function checkStatus(check: CiCheck): CiStatus {
  const normalized = normalizeConclusion(check.conclusion, check.status);
  if (check.required && (normalized === 'skip' || normalized === 'warn')) return 'fail';
  return normalized;
}

/** `true` when this check blocks a merge/release. */
export function isBlockingCheck(check: CiCheck): boolean {
  return check.required && checkStatus(check) !== 'pass';
}

/**
 * Collapses many statuses into one. Failures win over pending/warn, pending
 * wins over warn, and an all-skipped set stays skipped (nothing to report).
 */
export function rollupStatus(statuses: readonly CiStatus[]): CiStatus {
  if (!statuses.length) return 'skip';
  if (statuses.includes('fail')) return 'fail';
  if (statuses.includes('pending')) return 'pending';
  if (statuses.includes('warn')) return 'warn';
  if (statuses.includes('pass')) return 'pass';
  return 'skip';
}

/** Effective status of a run, combining its conclusion, jobs and checks. */
export function runStatus(run: CiRun): CiStatus {
  const own = normalizeConclusion(run.conclusion, run.status);
  const jobStatuses = run.jobs.map((job) => normalizeConclusion(job.conclusion, job.status));
  const checkStatuses = run.checks.map(checkStatus);
  // A completed failed run stays failed even if an old job list was truncated.
  if (own === 'fail') return 'fail';
  return rollupStatus([own, ...jobStatuses, ...checkStatuses]);
}

/**
 * Selects the latest attempt per logical run. Attempt number wins over
 * timestamps because clock skew across providers is common; updatedAt breaks
 * ties within an attempt. Older attempts remain available as rerun history.
 */
export function selectLatestRuns(
  runs: readonly CiRun[],
  nowMs?: number,
): { latest: CiRun[]; history: Record<string, CiRun[]> } {
  const groups = new Map<string, CiRun[]>();
  for (const run of runs) {
    const key = runGroupKey(run);
    const bucket = groups.get(key);
    if (bucket) bucket.push(run);
    else groups.set(key, [run]);
  }

  const time = (run: CiRun) => {
    const parsed = Date.parse(run.updatedAt || run.createdAt);
    return Number.isFinite(parsed) ? parsed : nowMs ?? 0;
  };
  const compare = (a: CiRun, b: CiRun) => {
    if (a.attempt !== b.attempt) return a.attempt - b.attempt;
    const byTime = time(a) - time(b);
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
  };

  const latest: CiRun[] = [];
  const history: Record<string, CiRun[]> = {};
  for (const bucket of groups.values()) {
    const ordered = [...bucket].sort(compare);
    const winner = ordered[ordered.length - 1];
    latest.push(winner);
    history[winner.id] = ordered.slice(0, -1);
  }
  latest.sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt));
  return { latest, history };
}

/** All statuses a UI filter can offer, in display order. */
export const CI_STATUS_OPTIONS: readonly CiStatus[] = CI_STATUSES;

/** Human copy used by cards, tables and aria labels. */
export const STATUS_LABEL: Record<CiStatus, string> = {
  pass: 'Passed',
  fail: 'Failed',
  warn: 'Warning',
  skip: 'Skipped',
  pending: 'In progress',
};
