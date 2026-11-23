/**
 * Deterministic mock provider (#2314).
 *
 * The snapshot is a constant: identical bytes on every call, in every runtime,
 * with no credentials and no wall-clock reads. `getSnapshot()` is async to
 * match the real GitHub adapter's contract.
 */

import {
  DEFAULT_GATE_POLICY,
  type CiAnnotation,
  type CiArtifact,
  type CiCheck,
  type CiJob,
  type CiRun,
  type CiSnapshot,
  type CiStep,
  type GateKind,
  type GateMetric,
} from './model';
import type { CiProvider } from './provider';

const BASE = Date.parse('2026-11-23T09:00:00.000Z');
const at = (minutesAgo: number) => new Date(BASE - minutesAgo * 60_000).toISOString();
const REPO_URL = 'https://github.com/SorobanCrashLab/soroban-crashlab';
const runUrl = (id: string) => `${REPO_URL}/actions/runs/${id}`;

function annotation(level: CiAnnotation['level'], message: string, path?: string): CiAnnotation {
  return { level, message, ...(path ? { path } : {}) };
}

function step(
  id: string,
  name: string,
  conclusion: string | null,
  durationMs: number,
  minutesAgo: number,
  options: { status?: string; annotations?: CiAnnotation[]; logUrl?: string } = {},
): CiStep {
  const completed = at(minutesAgo);
  const started = at(minutesAgo + durationMs / 60_000);
  return {
    id,
    name,
    number: Number(id.replace(/\D/g, '').slice(-2)) || 1,
    status: options.status ?? 'completed',
    conclusion,
    startedAt: started,
    completedAt: completed,
    durationMs,
    logUrl: options.logUrl ?? `${runUrl('logs')}#step=${id}`,
    annotations: options.annotations ?? [],
  };
}

function artifact(
  id: string,
  name: string,
  kind: CiArtifact['kind'],
  sizeBytes: number,
  internal = false,
): CiArtifact {
  return {
    id,
    name,
    kind,
    sizeBytes,
    url: `${REPO_URL}/actions/artifacts/${id}`,
    expiresAt: '2026-12-23T00:00:00.000Z',
    ...(internal ? { internal: true } : {}),
  };
}

function job(
  id: string,
  name: string,
  conclusion: string | null,
  gates: GateKind[],
  steps: CiStep[],
  minutesAgo: number,
  artifacts: CiArtifact[] = [],
  status = 'completed',
): CiJob {
  const durationMs = steps.reduce((sum, item) => sum + item.durationMs, 0);
  return {
    id,
    name,
    workflowName: 'CI',
    status,
    conclusion,
    startedAt: at(minutesAgo + durationMs / 60_000),
    completedAt: at(minutesAgo),
    durationMs,
    htmlUrl: `${runUrl('jobs')}?job=${id}`,
    steps,
    artifacts,
    gates,
  };
}

function check(
  id: string,
  name: string,
  conclusion: string | null,
  required: boolean,
  gate: GateKind | undefined,
): CiCheck {
  return {
    id,
    name,
    conclusion,
    status: 'completed',
    required,
    detailsUrl: `${REPO_URL}/runs/checks/${id}`,
    ...(gate ? { gate } : {}),
  };
}

interface RunSeed {
  id: string;
  workflowName?: string;
  event: CiRun['event'];
  branch: string;
  commitSha: string;
  commitMessage: string;
  prNumber?: number;
  author: string;
  attempt?: number;
  rerunOf?: string;
  conclusion: string | null;
  status?: string;
  minutesAgo: number;
  jobs: CiJob[];
  checks: CiCheck[];
  metrics: GateMetric[];
  artifacts: CiArtifact[];
  codeAreas: string[];
}

function makeRun(seed: RunSeed): CiRun {
  const durationMs = seed.jobs.reduce((sum, item) => sum + item.durationMs, 0);
  return {
    id: seed.id,
    workflowName: seed.workflowName ?? 'CI',
    event: seed.event,
    branch: seed.branch,
    commitSha: seed.commitSha,
    commitMessage: seed.commitMessage,
    ...(seed.prNumber !== undefined ? { prNumber: seed.prNumber } : {}),
    author: seed.author,
    attempt: seed.attempt ?? 1,
    ...(seed.rerunOf ? { rerunOf: seed.rerunOf } : {}),
    status: seed.status ?? 'completed',
    conclusion: seed.conclusion,
    createdAt: at(seed.minutesAgo + 12),
    updatedAt: at(seed.minutesAgo),
    durationMs,
    htmlUrl: runUrl(seed.id),
    jobs: seed.jobs,
    checks: seed.checks,
    artifacts: seed.artifacts,
    metrics: seed.metrics,
    codeAreas: seed.codeAreas,
  };
}

const prLintJob = job(
  'job-lint-1',
  'lint-and-typecheck',
  'success',
  ['lint'],
  [
    step('step-lint-1', 'eslint .', 'success', 34_000, 41),
    step('step-lint-2', 'tsc --noEmit', 'success', 52_000, 41),
  ],
  41,
);

const prUnitJob = job(
  'job-test-1',
  'unit-tests',
  'success',
  ['test', 'coverage'],
  [
    step('step-test-1', 'vitest run', 'success', 142_000, 41),
    step('step-test-2', 'coverage report', 'success', 18_000, 41),
  ],
  41,
  [artifact('art-coverage-1', 'coverage-summary', 'coverage', 48_120)],
);

const prE2eJob = job(
  'job-e2e-1',
  'e2e-playwright',
  'failure',
  ['e2e'],
  [
    step(
      'step-e2e-1',
      'playwright checkout.spec',
      'failure',
      96_000,
      41,
      {
        annotations: [
          annotation('failure', 'checkout.spec: 30s timeout waiting for billing summary', 'tests/e2e/checkout.spec.ts'),
          annotation('notice', 'Flaky on main in the last 7 days', 'tests/e2e/checkout.spec.ts'),
        ],
      },
    ),
    step('step-e2e-2', 'playwright auth.spec', 'success', 61_000, 41),
  ],
  41,
  [
    artifact('art-junit-1', 'junit-e2e.xml', 'report', 24_900),
    artifact('art-shot-1', 'checkout-failure.png', 'screenshot', 812_400),
    artifact('art-trace-1', 'trace-bundle.zip', 'trace', 9_400_000, true),
  ],
);

const prSecurityJob = job(
  'job-sec-1',
  'dependency-audit',
  'success',
  ['security'],
  [step('step-sec-1', 'audit dependencies', 'success', 41_000, 41)],
  41,
  [artifact('art-sbom-1', 'sbom.json', 'report', 115_000)],
);

const prRun: CiRun = makeRun({
  id: 'gh-run-9001',
  event: 'pull_request',
  branch: 'feat/ci-quality-gates',
  commitSha: 'a111111111111111111111111111111111111111',
  commitMessage: 'feat(ci): add quality gate dashboard (#2314)',
  prNumber: 2314,
  author: '@dev-ada',
  attempt: 2,
  rerunOf: 'gh-run-9000',
  conclusion: 'failure',
  minutesAgo: 41,
  jobs: [prLintJob, prUnitJob, prE2eJob, prSecurityJob],
  checks: [
    check('chk-required-lint', 'Lint / required', 'success', true, 'lint'),
    check('chk-required-test', 'Unit tests / required', 'success', true, 'test'),
    check('chk-required-e2e', 'E2E / required', 'failure', true, 'e2e'),
    check('chk-coverage', 'Coverage delta', 'neutral', false, 'coverage'),
  ],
  metrics: [
    { kind: 'coverage', name: 'coverage.pct', value: 82.4, baseline: 83.1, unit: '%' },
    { kind: 'perf', name: 'perf.durationMs', value: 1_940, baseline: 1_790, unit: 'ms' },
    { kind: 'visual', name: 'visual.diffPct', value: 0.12, baseline: 0.1, unit: '%' },
    { kind: 'mutation', name: 'mutation.pct', value: 62, baseline: 61, unit: '%' },
    { kind: 'security', name: 'security.critical', value: 0, unit: 'CVEs' },
    { kind: 'security', name: 'security.high', value: 1, unit: 'CVEs' },
  ],
  artifacts: [artifact('art-pr-report', 'ci-summary.html', 'report', 33_200)],
  codeAreas: ['checkout', 'billing', 'web'],
});

const firstPrAttempt: CiRun = makeRun({
  ...prRun,
  id: 'gh-run-9000',
  attempt: 1,
  rerunOf: undefined,
  conclusion: 'failure',
  minutesAgo: 58,
  jobs: [
    job(
      'job-e2e-0',
      'e2e-playwright',
      'failure',
      ['e2e'],
      [
        step(
          'step-e2e-0',
          'playwright checkout.spec',
          'failure',
          92_000,
          58,
          { annotations: [annotation('failure', 'checkout.spec timeout', 'tests/e2e/checkout.spec.ts')] },
        ),
      ],
      58,
    ),
  ],
  checks: [check('chk-required-e2e-0', 'E2E / required', 'failure', true, 'e2e')],
  metrics: [],
  artifacts: [],
});

const mainRun: CiRun = makeRun({
  id: 'gh-run-9002',
  event: 'push',
  branch: 'main',
  commitSha: 'b222222222222222222222222222222222222222',
  commitMessage: 'chore(web): refresh visual baselines (#2310)',
  author: '@dev-grace',
  conclusion: 'success',
  minutesAgo: 95,
  jobs: [
    job('job-lint-2', 'lint-and-typecheck', 'success', ['lint'], [step('step-lint-3', 'eslint .', 'success', 32_000, 95)], 95),
    job('job-test-2', 'unit-tests', 'success', ['test', 'coverage'], [step('step-test-3', 'vitest run', 'success', 138_000, 95)], 95),
    job('job-e2e-2', 'e2e-playwright', 'success', ['e2e'], [step('step-e2e-3', 'playwright checkout.spec', 'success', 88_000, 95)], 95),
  ],
  checks: [
    check('chk-main-lint', 'Lint / required', 'success', true, 'lint'),
    check('chk-main-test', 'Unit tests / required', 'success', true, 'test'),
    check('chk-main-e2e', 'E2E / required', 'success', true, 'e2e'),
  ],
  metrics: [
    { kind: 'coverage', name: 'coverage.pct', value: 83.4, baseline: 83.1, unit: '%' },
    { kind: 'perf', name: 'perf.durationMs', value: 1_712, baseline: 1_740, unit: 'ms' },
    { kind: 'visual', name: 'visual.diffPct', value: 0.09, baseline: 0.1, unit: '%' },
    { kind: 'mutation', name: 'mutation.pct', value: 64, baseline: 63, unit: '%' },
    { kind: 'security', name: 'security.critical', value: 0, unit: 'CVEs' },
    { kind: 'security', name: 'security.high', value: 1, unit: 'CVEs' },
  ],
  artifacts: [artifact('art-main-report', 'ci-summary.html', 'report', 31_800)],
  codeAreas: ['web', 'visual-review'],
});

const nightlyRun: CiRun = makeRun({
  id: 'gh-run-9003',
  workflowName: 'Nightly release readiness',
  event: 'schedule',
  branch: 'main',
  commitSha: 'c333333333333333333333333333333333333333',
  commitMessage: 'nightly: release candidate 2026.11.23',
  author: '@ci-bot',
  conclusion: 'failure',
  minutesAgo: 180,
  jobs: [
    job('job-nightly-e2e', 'e2e-nightly', 'failure', ['e2e'], [
      step('step-nightly-e2e', 'playwright checkout.spec', 'failure', 124_000, 180, {
        annotations: [annotation('failure', 'checkout.spec billing totals mismatch')],
      }),
    ], 180, [artifact('art-nightly-junit', 'nightly-junit.xml', 'report', 71_200)]),
    job('job-nightly-perf', 'perf-benchmarks', 'failure', ['perf'], [
      step('step-nightly-perf', 'perf harness p95', 'failure', 310_000, 180, {
        annotations: [annotation('warning', 'p95 regression 2050ms > 1800ms')],
      }),
    ], 180, [artifact('art-perf-json', 'perf-results.json', 'report', 204_800)]),
    job('job-nightly-visual', 'visual-diff', 'failure', ['visual'], [
      step('step-nightly-visual', 'compare snapshots', 'failure', 160_000, 180),
    ], 180, [artifact('art-visual-diff', 'visual-diff.html', 'report', 510_000)]),
    job('job-nightly-security', 'dependency-audit', 'success', ['security'], [
      step('step-nightly-sec', 'audit dependencies', 'success', 44_000, 180),
    ], 180),
  ],
  checks: [
    check('chk-nightly-e2e', 'Nightly E2E', 'failure', true, 'e2e'),
    check('chk-nightly-perf', 'Perf budget', 'failure', true, 'perf'),
    check('chk-nightly-visual', 'Visual budget', 'failure', false, 'visual'),
  ],
  metrics: [
    { kind: 'coverage', name: 'coverage.pct', value: 79.6, baseline: 83.1, unit: '%' },
    { kind: 'perf', name: 'perf.durationMs', value: 2_050, baseline: 1_740, unit: 'ms' },
    { kind: 'visual', name: 'visual.diffPct', value: 0.72, baseline: 0.1, unit: '%' },
    { kind: 'mutation', name: 'mutation.pct', value: 58, baseline: 63, unit: '%' },
    { kind: 'security', name: 'security.critical', value: 0, unit: 'CVEs' },
    { kind: 'security', name: 'security.high', value: 2, unit: 'CVEs' },
  ],
  artifacts: [],
  codeAreas: ['checkout', 'billing', 'performance'],
});

const cancelledRun: CiRun = makeRun({
  id: 'gh-run-9005',
  event: 'push',
  branch: 'main',
  commitSha: 'e555555555555555555555555555555555555555',
  commitMessage: 'chore: cancel superseded build',
  author: '@ci-bot',
  attempt: 2,
  rerunOf: 'gh-run-9004b',
  conclusion: 'cancelled',
  minutesAgo: 240,
  jobs: [
    job('job-cancel', 'e2e-playwright', 'cancelled', ['e2e'], [
      step('step-cancel', 'playwright auth.spec', 'cancelled', 1_000, 240),
    ], 240),
  ],
  checks: [check('chk-cancel', 'E2E / required', 'cancelled', true, 'e2e')],
  metrics: [],
  artifacts: [],
  codeAreas: ['web'],
});

const securityRun: CiRun = makeRun({
  id: 'gh-run-9006',
  event: 'pull_request',
  branch: 'fix/dependency-upgrade',
  commitSha: 'f666666666666666666666666666666666666666',
  commitMessage: 'fix(deps): bump transitive crypto package (#2312)',
  prNumber: 2312,
  author: '@dev-sam',
  conclusion: 'failure',
  minutesAgo: 320,
  jobs: [
    job('job-sec-fail', 'dependency-audit', 'failure', ['security'], [
      step('step-sec-fail', 'audit dependencies', 'failure', 39_000, 320, {
        annotations: [annotation('failure', 'CVE-2026-4012 critical in crypto-adapter')],
      }),
    ], 320),
    job('job-lint-fail', 'lint-and-typecheck', 'failure', ['lint'], [
      step('step-lint-fail', 'eslint .', 'failure', 30_000, 320, {
        annotations: [annotation('failure', 'react-hooks/exhaustive-deps', 'src/features/ci/hooks/useCiQuality.ts')],
      }),
    ], 320),
  ],
  checks: [check('chk-sec-required', 'Security / required', 'failure', true, 'security')],
  metrics: [
    { kind: 'security', name: 'security.critical', value: 1, unit: 'CVEs' },
    { kind: 'security', name: 'security.high', value: 3, unit: 'CVEs' },
  ],
  artifacts: [artifact('art-audit', 'audit-report.json', 'report', 92_000)],
  codeAreas: ['dependencies', 'web'],
});

/** Flake history: alternating checkout.spec outcomes across reruns. */
const flakeRuns: CiRun[] = [
  { id: 'gh-run-9010', minutesAgo: 4_320, conclusion: 'success', attempt: 1 },
  { id: 'gh-run-9011', minutesAgo: 3_600, conclusion: 'failure', attempt: 1 },
  { id: 'gh-run-9012', minutesAgo: 2_880, conclusion: 'success', attempt: 2 },
  { id: 'gh-run-9013', minutesAgo: 2_160, conclusion: 'failure', attempt: 3 },
  { id: 'gh-run-9014', minutesAgo: 1_440, conclusion: 'success', attempt: 4 },
  { id: 'gh-run-9015', minutesAgo: 720, conclusion: 'failure', attempt: 5 },
].map(({ id, minutesAgo, conclusion, attempt }) =>
  makeRun({
    id,
    event: 'push',
    branch: 'main',
    commitSha: `${attempt}77777777777777777777777777777777777777`,
    commitMessage: 'test(web): storefront checkout regression probe',
    author: '@qa-bot',
    rerunOf: 'gh-run-9010',
    attempt,
    conclusion,
    minutesAgo,
    jobs: [
      job('job-flake', 'e2e-storefront', conclusion, ['e2e'], [
        step(
          'step-flake-1',
          'playwright checkout.spec',
          conclusion,
          80_000 + attempt * 2_000,
          minutesAgo,
          {
            annotations:
              conclusion === 'failure'
                ? [annotation('failure', 'checkout.spec: billing summary timeout', 'tests/e2e/checkout.spec.ts')]
                : [],
          },
        ),
      ], minutesAgo),
    ],
    checks: [
      check('chk-flake', 'E2E / required', conclusion, true, 'e2e'),
    ],
    metrics: [],
    artifacts: [],
    codeAreas: ['checkout', 'billing'],
  }),
);

export const MOCK_GENERATED_AT = at(0);

export const MOCK_CI_SNAPSHOT: CiSnapshot = {
  repository: 'SorobanCrashLab/soroban-crashlab',
  source: 'mock',
  generatedAt: MOCK_GENERATED_AT,
  runs: [
    prRun,
    firstPrAttempt,
    mainRun,
    nightlyRun,
    cancelledRun,
    securityRun,
    ...flakeRuns,
  ],
  regressions: [
    {
      id: 'reg-checkout-441',
      fingerprint: 'checkout.spec billing summary timeout',
      title: 'Checkout billing summary timeout on e2e',
      status: 'investigating',
      detectedAt: at(3_600),
      areas: ['checkout', 'billing'],
      link: `${REPO_URL}/issues/2288`,
    },
    {
      id: 'reg-perf-118',
      fingerprint: 'p95 perf harness regression',
      title: 'p95 latency regression in storefront render',
      status: 'open',
      detectedAt: at(5_760),
      areas: ['performance', 'web'],
      link: `${REPO_URL}/issues/2301`,
    },
  ],
  incidents: [
    {
      id: 'inc-2026-11-22',
      title: 'Billing RPC degradation affecting checkout',
      severity: 'major',
      startedAt: at(4_320),
      resolvedAt: at(3_960),
      areas: ['billing', 'checkout'],
      link: `${REPO_URL}/issues/2277`,
    },
  ],
  changes: [
    {
      id: 'chg-2311',
      title: 'Refactor billing summary totals',
      author: '@dev-lin',
      mergedAt: at(4_100),
      areas: ['billing', 'checkout'],
      files: ['src/features/billing/summary.ts', 'src/app/api/billing/route.ts'],
      prNumber: 2311,
    },
    {
      id: 'chg-2309',
      title: 'Upgrade renderer dependency',
      author: '@dev-om',
      mergedAt: at(5_200),
      areas: ['performance', 'web'],
      files: ['package.json'],
      prNumber: 2309,
    },
  ],
  policy: DEFAULT_GATE_POLICY,
};

export const deterministicMockProvider: CiProvider = {
  id: 'mock',
  async getSnapshot() {
    return MOCK_CI_SNAPSHOT;
  },
};

export default deterministicMockProvider;
