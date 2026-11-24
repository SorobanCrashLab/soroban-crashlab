/**
 * CI Checks & Quality Gates domain model (#2314).
 *
 * Framework-free types shared by the API routes, the client hook and the UI.
 * The shape mirrors GitHub Actions conceptually (workflow runs → jobs → steps,
 * plus check runs and artifacts) without importing any GitHub SDK into the
 * browser bundle. Values are normalized at the provider boundary: no raw
 * provider payload ever reaches a component.
 */

export const GATE_KINDS = [
  'lint',
  'test',
  'e2e',
  'coverage',
  'mutation',
  'perf',
  'visual',
  'security',
] as const;
export type GateKind = (typeof GATE_KINDS)[number];

export const GATE_LABELS: Record<GateKind, string> = {
  lint: 'Lint & typecheck',
  test: 'Unit tests',
  e2e: 'End-to-end tests',
  coverage: 'Coverage',
  mutation: 'Mutation testing',
  perf: 'Performance',
  visual: 'Visual regression',
  security: 'Security & dependencies',
};

/** The five states every provider conclusion is reduced to. */
export const CI_STATUSES = ['pass', 'fail', 'warn', 'skip', 'pending'] as const;
export type CiStatus = (typeof CI_STATUSES)[number];

export type CiEvent = 'pull_request' | 'push' | 'schedule' | 'release';
export type CiView = 'pr' | 'branch' | 'release' | 'flakes' | 'gates' | 'all';

export interface CiAnnotation {
  level: 'notice' | 'warning' | 'failure';
  message: string;
  path?: string;
  line?: number;
}

export interface CiArtifact {
  id: string;
  name: string;
  kind: 'log' | 'report' | 'screenshot' | 'coverage' | 'trace' | 'other';
  sizeBytes: number;
  /** Provider URL. Must be http(s) or a same-origin path with no credentials. */
  url: string;
  expiresAt?: string;
  /** Internal artifacts are removed for principals without internal access. */
  internal?: boolean;
}

export interface CiStep {
  id: string;
  name: string;
  number: number;
  status: string;
  /** Raw provider conclusion; normalized with `normalizeConclusion()`. */
  conclusion: string | null;
  startedAt?: string;
  completedAt?: string;
  durationMs: number;
  logUrl?: string;
  annotations: CiAnnotation[];
}

export interface CiJob {
  id: string;
  name: string;
  workflowName: string;
  status: string;
  conclusion: string | null;
  startedAt?: string;
  completedAt?: string;
  durationMs: number;
  htmlUrl?: string;
  steps: CiStep[];
  artifacts: CiArtifact[];
  /** Gates this job contributes evidence to. */
  gates: GateKind[];
}

export interface CiCheck {
  id: string;
  name: string;
  conclusion: string | null;
  status: string;
  required: boolean;
  detailsUrl?: string;
  gate?: GateKind;
}

/** A measured gate value (and optional previous-run baseline). */
export interface GateMetric {
  kind: GateKind;
  /** Dot-separated metric name, e.g. `coverage.pct` or `perf.durationMs`. */
  name: string;
  value: number;
  unit: string;
  baseline?: number;
}

export interface CiRun {
  id: string;
  workflowName: string;
  event: CiEvent;
  branch: string;
  commitSha: string;
  commitMessage: string;
  prNumber?: number;
  author: string;
  /** Reruns share a `rerunOf` (or increase `attempt`); latest attempt wins. */
  attempt: number;
  rerunOf?: string;
  status: string;
  conclusion: string | null;
  createdAt: string;
  updatedAt: string;
  durationMs: number;
  htmlUrl?: string;
  jobs: CiJob[];
  checks: CiCheck[];
  artifacts: CiArtifact[];
  metrics: GateMetric[];
  codeAreas: string[];
}

export interface RegressionRecord {
  id: string;
  fingerprint: string;
  title: string;
  status: 'open' | 'investigating' | 'fixed';
  detectedAt: string;
  areas: string[];
  link?: string;
}

export interface IncidentRecord {
  id: string;
  title: string;
  severity: 'info' | 'minor' | 'major' | 'critical';
  startedAt: string;
  resolvedAt?: string;
  areas: string[];
  link?: string;
}

export interface ChangeRecord {
  id: string;
  title: string;
  author: string;
  mergedAt: string;
  areas: string[];
  files: string[];
  prNumber?: number;
}

export interface CiGatePolicy {
  coverageMinPct: number;
  /** Coverage may dip this many points below the minimum before failing. */
  coverageDeltaTolerancePct: number;
  perfMaxMs: number;
  perfDeltaTolerancePct: number;
  visualDiffMaxPct: number;
  visualDeltaTolerancePct: number;
  mutationMinPct: number;
  maxCriticalVulns: number;
  maxHighVulns: number;
}

export const DEFAULT_GATE_POLICY: CiGatePolicy = {
  coverageMinPct: 80,
  coverageDeltaTolerancePct: 0.5,
  perfMaxMs: 1_800,
  perfDeltaTolerancePct: 5,
  visualDiffMaxPct: 0.5,
  visualDeltaTolerancePct: 0.25,
  mutationMinPct: 60,
  maxCriticalVulns: 0,
  maxHighVulns: 2,
};

export interface CiSnapshot {
  repository: string;
  source: 'mock' | 'github';
  generatedAt: string;
  runs: CiRun[];
  regressions: RegressionRecord[];
  incidents: IncidentRecord[];
  changes: ChangeRecord[];
  policy: CiGatePolicy;
}

export interface CiQuery {
  view: CiView;
  pr?: number;
  branch?: string;
  sha?: string;
  gate?: GateKind;
  status?: CiStatus;
  q?: string;
  limit: number;
}

export const DEFAULT_CI_QUERY: CiQuery = { view: 'all', limit: 50 };

/** A local subscription; delivery is via the documented notification hook. */
export interface CiSubscription {
  id: string;
  target: string;
  kinds: Array<'gate-regression' | 'required-check-failure'>;
  createdAt: string;
}

export interface CiNotification {
  id: string;
  kind: 'gate-regression' | 'required-check-failure' | 'action';
  message: string;
  runId?: string;
  createdAt: string;
}

/**
 * Removes credentials from provider URLs before they are stored or rendered.
 * Only http(s) and same-origin paths are allowed; userinfo and credential-like
 * query keys are dropped.
 */
export function sanitizeUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw, 'https://ci.invalid');
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    url.username = '';
    url.password = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/token|secret|key|password|signature|sig|auth/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    // Relative provider paths are rendered as paths; absolute links keep host.
    return raw.startsWith('/') ? `${url.pathname}${url.search}${url.hash}` : url.toString();
  } catch {
    return undefined;
  }
}

/** Stable identity for a run across its reruns. */
export function runGroupKey(run: CiRun): string {
  return `${run.workflowName}|${run.event}|${run.branch}|${run.rerunOf ?? run.id}`;
}
