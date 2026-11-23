/**
 * GitHub Actions adapter (#2314).
 *
 * Server-side only: the REST client takes a token from the caller (read from a
 * server environment variable by the API route) and puts it in a request
 * header. Tokens are never stored in the normalized model, URLs, cache keys or
 * errors. Browser code imports only the pure mapping helpers from this module.
 */

import {
  DEFAULT_GATE_POLICY,
  sanitizeUrl,
  type CiArtifact,
  type CiCheck,
  type CiJob,
  type CiRun,
  type CiSnapshot,
  type GateKind,
  type GateMetric,
} from './model';
import type { CiProvider } from './provider';

export interface GitHubWorkflowRunPayload {
  id: number;
  name?: string;
  event?: string;
  head_branch?: string | null;
  head_sha?: string;
  display_title?: string;
  status?: string | null;
  conclusion?: string | null;
  created_at?: string;
  updated_at?: string;
  run_attempt?: number;
  html_url?: string;
  jobs_url?: string;
  check_suite_url?: string;
  artifacts_url?: string;
  actor?: { login?: string };
  pull_requests?: Array<{ number?: number }>;
}

export interface GitHubStepPayload {
  name?: string;
  status?: string | null;
  conclusion?: string | null;
  number?: number;
  started_at?: string;
  completed_at?: string;
}

export interface GitHubJobPayload {
  id: number;
  name?: string;
  status?: string | null;
  conclusion?: string | null;
  started_at?: string;
  completed_at?: string;
  html_url?: string;
  steps?: GitHubStepPayload[];
}

export interface GitHubCheckRunPayload {
  id: number;
  name?: string;
  status?: string | null;
  conclusion?: string | null;
  html_url?: string;
}

export interface GitHubArtifactPayload {
  id: number;
  name?: string;
  size_in_bytes?: number;
  url?: string;
  expired?: boolean;
}

export interface GitHubActionsClient {
  listWorkflowRuns(options: { perPage: number }): Promise<GitHubWorkflowRunPayload[]>;
  listJobs(runId: string): Promise<GitHubJobPayload[]>;
  listCheckRuns(sha: string): Promise<GitHubCheckRunPayload[]>;
  listArtifacts(runId: string): Promise<GitHubArtifactPayload[]>;
}

function iso(value: string | undefined | null): string {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '1970-01-01T00:00:00.000Z';
}

function durationMs(startedAt?: string, completedAt?: string): number {
  const start = Date.parse(startedAt ?? '');
  const end = Date.parse(completedAt ?? '');
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : 0;
}

const EVENTS: Record<string, CiRun['event']> = {
  pull_request: 'pull_request',
  push: 'push',
  schedule: 'schedule',
  workflow_dispatch: 'release',
  release: 'release',
};

/** Best-effort gate tagging from job/step names; providers may override via annotations. */
export function gateFromName(name: string): GateKind | undefined {
  const value = name.toLowerCase();
  if (/mutation/.test(value)) return 'mutation';
  if (/visual|screenshot|snapshot/.test(value)) return 'visual';
  if (/perf|benchmark|latency/.test(value)) return 'perf';
  if (/security|audit|dependabot|codeql/.test(value)) return 'security';
  if (/coverage/.test(value)) return 'coverage';
  if (/e2e|playwright|cypress|integration/.test(value)) return 'e2e';
  if (/lint|typecheck|format/.test(value)) return 'lint';
  if (/test|vitest|jest/.test(value)) return 'test';
  return undefined;
}

/** Extracts numeric gate budgets from annotation text such as `p95 1700ms`. */
export function metricsFromAnnotations(text: string): GateMetric[] {
  const metrics: GateMetric[] = [];
  const coverage = /coverage\s+(\d+(?:\.\d+)?)\s*%/i.exec(text);
  const perf = /p95\s+(\d+(?:\.\d+)?)\s*ms/i.exec(text);
  const visual = /visual\s+diff\s+(\d+(?:\.\d+)?)\s*%/i.exec(text);
  const mutation = /mutation\s+(\d+(?:\.\d+)?)\s*%/i.exec(text);
  const critical = /(\d+)\s+critical/i.exec(text);
  const high = /(\d+)\s+high/i.exec(text);
  if (coverage) metrics.push({ kind: 'coverage', name: 'coverage.pct', value: Number(coverage[1]), unit: '%' });
  if (perf) metrics.push({ kind: 'perf', name: 'perf.durationMs', value: Number(perf[1]), unit: 'ms' });
  if (visual) metrics.push({ kind: 'visual', name: 'visual.diffPct', value: Number(visual[1]), unit: '%' });
  if (mutation) metrics.push({ kind: 'mutation', name: 'mutation.pct', value: Number(mutation[1]), unit: '%' });
  if (critical) metrics.push({ kind: 'security', name: 'security.critical', value: Number(critical[1]), unit: 'CVEs' });
  if (high) metrics.push({ kind: 'security', name: 'security.high', value: Number(high[1]), unit: 'CVEs' });
  return metrics;
}

export function mapGitHubArtifact(payload: GitHubArtifactPayload): CiArtifact {
  const kind: CiArtifact['kind'] = /junit|report|json|html/i.test(payload.name ?? '')
    ? 'report'
    : /screen|shot|png/i.test(payload.name ?? '')
      ? 'screenshot'
      : /log/i.test(payload.name ?? '')
        ? 'log'
        : 'other';
  return {
    id: `art-${payload.id}`,
    name: String(payload.name ?? `artifact-${payload.id}`),
    kind,
    sizeBytes: Math.max(0, payload.size_in_bytes ?? 0),
    url: sanitizeUrl(payload.url) ?? '',
    ...(payload.expired ? { expiresAt: '1970-01-01T00:00:00.000Z' } : {}),
  };
}

export function mapGitHubJob(payload: GitHubJobPayload): CiJob {
  const steps = (payload.steps ?? []).map((step, index) => ({
    id: `step-${payload.id}-${step.number ?? index + 1}`,
    name: String(step.name ?? `Step ${index + 1}`),
    number: step.number ?? index + 1,
    status: String(step.status ?? 'completed'),
    conclusion: step.conclusion ?? null,
    startedAt: step.started_at,
    completedAt: step.completed_at,
    durationMs: durationMs(step.started_at, step.completed_at),
    annotations: [],
  }));
  const kind = gateFromName(String(payload.name ?? ''));
  return {
    id: `job-${payload.id}`,
    name: String(payload.name ?? `job-${payload.id}`),
    workflowName: 'GitHub Actions',
    status: String(payload.status ?? 'completed'),
    conclusion: payload.conclusion ?? null,
    startedAt: payload.started_at,
    completedAt: payload.completed_at,
    durationMs: durationMs(payload.started_at, payload.completed_at),
    htmlUrl: sanitizeUrl(payload.html_url),
    steps,
    artifacts: [],
    gates: kind ? [kind] : [],
  };
}

export function mapGitHubCheck(payload: GitHubCheckRunPayload): CiCheck {
  const name = String(payload.name ?? 'check');
  const gate = gateFromName(name);
  return {
    id: `chk-${payload.id}`,
    name,
    conclusion: payload.conclusion ?? null,
    status: String(payload.status ?? 'completed'),
    // GitHub stores required-check names in branch protection, not in check
    // runs; a caller can override this field after mapping.
    required: false,
    detailsUrl: sanitizeUrl(payload.html_url),
    ...(gate ? { gate } : {}),
  };
}

export function mapGitHubRun(
  payload: GitHubWorkflowRunPayload,
  jobs: readonly GitHubJobPayload[],
  checks: readonly GitHubCheckRunPayload[],
  artifacts: readonly GitHubArtifactPayload[],
): CiRun {
  const attempt = payload.run_attempt ?? 1;
  const mappedJobs = jobs.map(mapGitHubJob);
  const metrics = mappedJobs.flatMap((job) =>
    job.steps.flatMap((step) =>
      metricsFromAnnotations(
        step.annotations.map((annotation) => annotation.message).join(' '),
      ),
    ),
  );
  return {
    id: `gh-run-${payload.id}`,
    workflowName: String(payload.name ?? 'GitHub Actions'),
    event: EVENTS[payload.event ?? ''] ?? 'push',
    branch: String(payload.head_branch ?? 'unknown'),
    commitSha: String(payload.head_sha ?? ''),
    commitMessage: String(payload.display_title ?? ''),
    ...(payload.pull_requests?.[0]?.number
      ? { prNumber: payload.pull_requests[0].number }
      : {}),
    author: String(payload.actor?.login ?? 'unknown'),
    attempt,
    ...(attempt > 1 ? { rerunOf: `gh-run-${payload.id}` } : {}),
    status: String(payload.status ?? 'completed'),
    conclusion: payload.conclusion ?? null,
    createdAt: iso(payload.created_at),
    updatedAt: iso(payload.updated_at ?? payload.created_at),
    durationMs: mappedJobs.reduce((sum, job) => sum + job.durationMs, 0),
    htmlUrl: sanitizeUrl(payload.html_url),
    jobs: mappedJobs,
    checks: checks.map(mapGitHubCheck),
    artifacts: artifacts.map(mapGitHubArtifact),
    metrics,
    codeAreas: [...new Set(mappedJobs.map((job) => job.name))].slice(0, 10),
  };
}

/** Wraps an injected client in the shared provider interface. */
export function createGitHubActionsAdapter(
  client: GitHubActionsClient,
  repository = 'SorobanCrashLab/soroban-crashlab',
): CiProvider {
  return {
    id: 'github',
    async getSnapshot() {
      const payloads = await client.listWorkflowRuns({ perPage: 50 });
      const runs = await Promise.all(
        payloads.map(async (payload) => {
          const [jobs, checks, artifacts] = await Promise.all([
            client.listJobs(String(payload.id)),
            payload.head_sha ? client.listCheckRuns(payload.head_sha) : Promise.resolve([]),
            client.listArtifacts(String(payload.id)),
          ]);
          return mapGitHubRun(payload, jobs, checks, artifacts);
        }),
      );
      const snapshot: CiSnapshot = {
        repository,
        source: 'github',
        generatedAt: new Date().toISOString(),
        runs,
        regressions: [],
        incidents: [],
        changes: [],
        policy: DEFAULT_GATE_POLICY,
      };
      return snapshot;
    },
  };
}

interface RestClientOptions {
  owner: string;
  repo: string;
  /** Read from a server-side environment variable by the caller. */
  token?: string;
  fetchImpl?: typeof fetch;
}

/** Concrete REST client. Never import this from a client component. */
export function createGitHubRestClient(options: RestClientOptions): GitHubActionsClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = `https://api.github.com/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}`;

  async function get<T>(path: string): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    const response = await fetchImpl(`${base}${path}`, { headers, cache: 'no-store' });
    if (!response.ok) {
      // Delete the header before an error can be serialized anywhere.
      delete headers.Authorization;
      throw new Error(`GitHub API request failed with status ${response.status}`);
    }
    return (await response.json()) as T;
  }

  return {
    async listWorkflowRuns({ perPage }) {
      const json = await get<{ workflow_runs?: GitHubWorkflowRunPayload[] }>(
        `/actions/runs?per_page=${Math.min(100, Math.max(1, perPage))}`,
      );
      return json.workflow_runs ?? [];
    },
    listJobs(runId) {
      return get<{ jobs?: GitHubJobPayload[] }>(`/actions/runs/${encodeURIComponent(runId)}/jobs`).then(
        (json) => json.jobs ?? [],
      );
    },
    listCheckRuns(sha) {
      return get<{ check_runs?: GitHubCheckRunPayload[] }>(
        `/commits/${encodeURIComponent(sha)}/check-runs`,
      ).then((json) => json.check_runs ?? []);
    },
    listArtifacts(runId) {
      return get<{ artifacts?: GitHubArtifactPayload[] }>(
        `/actions/runs/${encodeURIComponent(runId)}/artifacts`,
      ).then((json) => json.artifacts ?? []);
    },
  };
}
