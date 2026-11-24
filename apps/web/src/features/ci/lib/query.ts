/** Shared zod-validated query parsing and deterministic run filtering. */

import { z } from 'zod';
import {
  CI_STATUSES,
  DEFAULT_CI_QUERY,
  GATE_KINDS,
  type CiQuery,
  type CiRun,
  type CiView,
} from './model';
import { selectLatestRuns, runStatus } from './status';

const VIEWS = ['pr', 'branch', 'release', 'flakes', 'gates', 'all'] as const satisfies readonly CiView[];

export const ciQuerySchema = z
  .object({
    view: z.enum(VIEWS).default('all'),
    pr: z.coerce.number().int().positive().max(1_000_000_000).optional(),
    branch: z.string().trim().min(1).max(120).optional(),
    sha: z
      .string()
      .regex(/^[0-9a-f]{40}$/, 'sha must be 40 lowercase hex characters')
      .optional(),
    gate: z.enum(GATE_KINDS).optional(),
    status: z.enum(CI_STATUSES).optional(),
    q: z.string().trim().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strip();

export type ParsedCiQuery = z.infer<typeof ciQuerySchema>;

export type QueryParseResult =
  | { ok: true; query: CiQuery }
  | { ok: false; errors: string[] };

function toRecord(
  input: URLSearchParams | Record<string, string | string[] | undefined>,
): Record<string, string | undefined> {
  if (input instanceof URLSearchParams) {
    return Object.fromEntries(input.entries());
  }
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) result[key] = value[0];
    else result[key] = value;
  }
  return result;
}

/** Parses query params without throwing; unknown keys are ignored. */
export function parseCiQuery(
  input: URLSearchParams | Record<string, string | string[] | undefined>,
): QueryParseResult {
  const raw = toRecord(input);
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value !== undefined && value !== '') cleaned[key] = value;
  }
  const parsed = ciQuerySchema.safeParse(cleaned);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'query'}: ${issue.message}`),
    };
  }
  return { ok: true, query: parsed.data as CiQuery };
}

function matchesView(run: CiRun, view: CiView, branch?: string): boolean {
  switch (view) {
    case 'pr':
      return run.prNumber !== undefined;
    case 'branch':
      return run.branch === (branch ?? 'main');
    case 'release':
      return run.event === 'release' || run.event === 'schedule';
    case 'flakes':
      return true;
    case 'gates':
    case 'all':
      return true;
  }
}

function searchableText(run: CiRun): string {
  return [
    run.workflowName,
    run.branch,
    run.commitSha,
    run.commitMessage,
    run.author,
    run.prNumber ? `#${run.prNumber}` : '',
    ...run.jobs.flatMap((job) => [
      job.name,
      ...job.steps.map((step) => step.name),
    ]),
    ...run.checks.map((check) => check.name),
  ]
    .join(' ')
    .toLowerCase();
}

/**
 * Applies the view, filters and limit to the *latest attempt* of each logical
 * run. Ordering is deterministic: newest update first, then id.
 */
export function filterRunsForQuery(runs: readonly CiRun[], query: CiQuery): CiRun[] {
  const latest = selectLatestRuns(runs).latest;
  const needle = query.q?.trim().toLowerCase();
  const filtered = latest.filter((run) => {
    if (!matchesView(run, query.view, query.branch)) return false;
    if (query.pr !== undefined && run.prNumber !== query.pr) return false;
    if (query.sha && run.commitSha !== query.sha) return false;
    if (query.gate) {
      const hasGate =
        run.jobs.some((job) => job.gates.includes(query.gate!)) ||
        run.metrics.some((metric) => metric.kind === query.gate) ||
        run.checks.some((check) => check.gate === query.gate);
      if (!hasGate) return false;
    }
    if (query.status && runStatus(run) !== query.status) return false;
    if (needle && !searchableText(run).includes(needle)) return false;
    return true;
  });
  return filtered.slice(0, query.limit ?? DEFAULT_CI_QUERY.limit);
}
