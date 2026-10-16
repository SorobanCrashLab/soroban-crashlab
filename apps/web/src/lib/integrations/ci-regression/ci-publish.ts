/**
 * CI-side logic behind apps/web/scripts/ci-regression.ts (#1890, #1891):
 * build the result from the Actions environment, then publish it to GitHub
 * (sticky comment + check run) and to the dashboard ingest API.
 *
 * Report-only phase: every publishing failure is logged as a `::warning::` and
 * the exit code stays 0, so a GitHub or dashboard outage never fails the
 * regression gate. `CRASHLAB_CI_REPORT_STRICT=true` is the documented flip
 * point that makes a failed dashboard post exit 1.
 *
 * Relative imports and globals only — the workflow compiles this with `tsc`.
 */

import { classifyReport, summarizeDeltas } from './classify';
import { createCheckRun, createGithubRestClient, upsertStickyComment } from './github-sticky-comment';
import { buildCheckSummary, buildStickyCommentBody, STICKY_COMMENT_MARKER } from './summary-markdown';
import {
  CI_EVENTS,
  CI_RESULT_SCHEMA_VERSION,
  type CiEvent,
  type CiRegressionResult,
  type RegressionBaseline,
  type RegressionSuiteReport,
} from './types';

export const CHECK_RUN_NAME = 'CrashLab regression summary';
const POST_ATTEMPTS = 3;
const POST_TIMEOUT_MS = 10_000;

export type CiEnv = Record<string, string | undefined>;

export interface PublishDeps {
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
  /** Delay between dashboard retries; injectable so tests do not wait. */
  sleep?: (ms: number) => Promise<void>;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Builds the ingest payload from the GitHub Actions environment. */
export function resultFromEnvironment(
  report: RegressionSuiteReport,
  baseline: RegressionBaseline,
  env: CiEnv,
  now: Date = new Date(),
): CiRegressionResult {
  const repository = nonEmpty(env.GITHUB_REPOSITORY);
  // On pull_request GITHUB_SHA is the merge commit; the workflow passes the
  // PR head through CI_HEAD_SHA so results attach to the commit people see.
  const commitSha = nonEmpty(env.CI_HEAD_SHA) ?? nonEmpty(env.GITHUB_SHA);
  if (!repository || !commitSha) throw new Error('GITHUB_REPOSITORY and GITHUB_SHA are required.');

  const eventName = nonEmpty(env.GITHUB_EVENT_NAME) ?? 'workflow_dispatch';
  const event: CiEvent = (CI_EVENTS as readonly string[]).includes(eventName)
    ? (eventName as CiEvent)
    : 'workflow_dispatch';
  const prRaw = nonEmpty(env.CI_PR_NUMBER);
  const prNumber = prRaw && /^[1-9][0-9]*$/.test(prRaw) ? Number(prRaw) : null;
  const runId = nonEmpty(env.GITHUB_RUN_ID) ?? 'local';
  const runAttempt = nonEmpty(env.GITHUB_RUN_ATTEMPT) ?? '1';
  const serverUrl = nonEmpty(env.GITHUB_SERVER_URL) ?? 'https://github.com';
  const runUrl = runId === 'local' ? null : `${serverUrl}/${repository}/actions/runs/${runId}`;

  return {
    schemaVersion: CI_RESULT_SCHEMA_VERSION,
    repository,
    commitSha,
    prNumber,
    ref: nonEmpty(env.GITHUB_REF) ?? null,
    event,
    suiteRunId: `${runId}-${runAttempt}`,
    runUrl,
    completedAt: now.toISOString(),
    fixtures: classifyReport(report, baseline),
    artifacts: runUrl ? [{ name: 'workflow run', url: runUrl }] : [],
  };
}

async function postToDashboard(
  result: CiRegressionResult,
  apiUrl: string,
  token: string,
  fetchImpl: typeof fetch,
  sleep: (ms: number) => Promise<void>,
): Promise<'created' | 'replayed'> {
  const url = `${apiUrl.replace(/\/+$/, '')}/api/integrations/ci/results`;
  let lastError = '';
  for (let attempt = 1; attempt <= POST_ATTEMPTS; attempt++) {
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
        signal: AbortSignal.timeout(POST_TIMEOUT_MS),
      });
      // The ingest is idempotent per (sha, suite run), so a retry is safe;
      // only transient statuses are worth another attempt.
      if (response.ok) return response.status === 201 ? 'created' : 'replayed';
      lastError = `HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`;
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    if (attempt < POST_ATTEMPTS) await sleep(1_000 * attempt);
  }
  throw new Error(lastError);
}

/** Publishes the result; returns the process exit code. */
export async function publishCiResult(
  result: CiRegressionResult,
  env: CiEnv,
  deps: PublishDeps = {},
): Promise<number> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const log = deps.log ?? ((line: string) => console.log(line));
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  // `::warning::` surfaces in the Actions UI without failing the step.
  const warn = (message: string) => log(`::warning::${message.replace(/\r?\n/g, ' ')}`);
  const deltas = summarizeDeltas(result.fixtures);

  const githubToken = nonEmpty(env.GITHUB_TOKEN);
  if (!githubToken) {
    warn('GITHUB_TOKEN not set; skipping PR comment and check run.');
  } else {
    const client = createGithubRestClient({ token: githubToken, apiUrl: nonEmpty(env.GITHUB_API_URL), fetchImpl });

    if (result.prNumber !== null) {
      try {
        const { action, commentId } = await upsertStickyComment(client, {
          repository: result.repository,
          issueNumber: result.prNumber,
          body: buildStickyCommentBody(result),
          marker: STICKY_COMMENT_MARKER,
        });
        log(`sticky comment ${action} (id ${commentId})`);
      } catch (error) {
        // Fork PRs get a read-only token: expected, never a gate failure.
        warn(`Could not post the regression summary comment: ${(error as Error).message}`);
      }
    }

    try {
      const check = buildCheckSummary(result);
      await createCheckRun(client, {
        repository: result.repository,
        headSha: result.commitSha,
        name: CHECK_RUN_NAME,
        conclusion: deltas.blocking > 0 ? 'failure' : 'success',
        title: check.title,
        summary: check.summary,
        detailsUrl: result.runUrl,
      });
      log('check run created');
    } catch (error) {
      warn(`Could not create the regression check run: ${(error as Error).message}`);
    }
  }

  const apiUrl = nonEmpty(env.CRASHLAB_API_URL);
  const ciToken = nonEmpty(env.CRASHLAB_CI_TOKEN);
  if (!apiUrl || !ciToken) {
    log('CRASHLAB_API_URL / CRASHLAB_CI_TOKEN not configured; skipping dashboard post.');
    return 0;
  }
  try {
    log(`dashboard post: ${await postToDashboard(result, apiUrl, ciToken, fetchImpl, sleep)}`);
    return 0;
  } catch (error) {
    const message = `Could not post results to the dashboard: ${(error as Error).message}`;
    if (env.CRASHLAB_CI_REPORT_STRICT === 'true') {
      log(`::error::${message}`);
      return 1;
    }
    warn(message);
    return 0;
  }
}
