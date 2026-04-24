/**
 * Issue #253 – Integrate: Automated regression deploy integration
 *
 * Pure utility functions extracted for deterministic unit testing.
 */

export type RegressionDeployStage =
  | 'idle'
  | 'deploying'
  | 'running_regression'
  | 'verifying_artifacts'
  | 'passed'
  | 'failed';

export interface RegressionDeployIntegrationResult {
  deploymentId: string;
  durationMs: number;
  testsScheduled: number;
  testsPassed: number;
  baselineArtifactDigest: string;
  deployedArtifactDigest: string;
  digestsMatch: boolean;
  regressionDeltaEmpty: boolean;
}

export interface RegressionDeployScenario {
  id: string;
  label: string;
  description: string;
  gitRef: string;
  environment: string;
  suiteName: string;
  stage: RegressionDeployStage;
  errorMessage?: string;
  result?: RegressionDeployIntegrationResult;
}

/** Returns true when a scenario is actively progressing through the pipeline. */
export function isBusyStage(stage: RegressionDeployStage): boolean {
  return (
    stage === 'deploying' ||
    stage === 'running_regression' ||
    stage === 'verifying_artifacts'
  );
}

/** Returns true when a scenario has reached a terminal state (no longer running). */
export function isTerminalStage(stage: RegressionDeployStage): boolean {
  return stage === 'passed' || stage === 'failed';
}

/** Determines the pipeline step index (0-based) for progress display. Returns -1 when idle. */
export function stageStepIndex(stage: RegressionDeployStage): number {
  switch (stage) {
    case 'deploying': return 0;
    case 'running_regression': return 1;
    case 'verifying_artifacts': return 2;
    case 'passed': return 3;
    case 'failed': return 2;
    default: return -1;
  }
}

/** Derives the number of tests to schedule for a given suite name. */
export function deriveTestsScheduled(suiteName: string): number {
  if (suiteName.includes('diff')) return 48;
  if (suiteName.includes('smoke')) return 120;
  return 312;
}

/** Builds a baseline artifact digest string from a scenario id. */
export function buildBaselineDigest(scenarioId: string): string {
  const slug = scenarioId.replace(/[^a-z0-9]/gi, '').slice(0, 12);
  return `sha256:${slug}:baseline`;
}

export interface ScenarioSummary {
  total: number;
  passed: number;
  failed: number;
  busy: number;
  idle: number;
}

/** Aggregates pass/fail/busy counts across all scenarios. */
export function summariseScenarios(scenarios: RegressionDeployScenario[]): ScenarioSummary {
  return scenarios.reduce<ScenarioSummary>(
    (acc, s) => ({
      total: acc.total + 1,
      passed: acc.passed + (s.stage === 'passed' ? 1 : 0),
      failed: acc.failed + (s.stage === 'failed' ? 1 : 0),
      busy: acc.busy + (isBusyStage(s.stage) ? 1 : 0),
      idle: acc.idle + (s.stage === 'idle' ? 1 : 0),
    }),
    { total: 0, passed: 0, failed: 0, busy: 0, idle: 0 }
  );
}

export interface ResultValidation {
  isValid: boolean;
  errors: string[];
}

/** Validates a completed RegressionDeployIntegrationResult for observable success criteria. */
export function validateResult(result: RegressionDeployIntegrationResult): ResultValidation {
  const errors: string[] = [];
  if (!result.deploymentId) errors.push('deploymentId is required');
  if (result.durationMs < 0) errors.push('durationMs must be >= 0');
  if (result.testsScheduled < 0) errors.push('testsScheduled must be >= 0');
  if (result.testsPassed < 0) errors.push('testsPassed must be >= 0');
  if (result.testsPassed > result.testsScheduled)
    errors.push('testsPassed cannot exceed testsScheduled');
  if (!result.baselineArtifactDigest) errors.push('baselineArtifactDigest is required');
  if (!result.deployedArtifactDigest) errors.push('deployedArtifactDigest is required');
  return { isValid: errors.length === 0, errors };
}
