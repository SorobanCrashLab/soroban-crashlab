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

// ═══════════════════════════════════════════════════════════════════════════
// CI Regression Integration (Issue #404)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Configuration for the CI regression job.
 */
export interface CIRegressionConfig {
  /** Path to the fixtures directory or file */
  fixturePath: string;
  /** Git reference (branch or commit SHA) */
  gitRef: string;
  /** Deployment environment (e.g., 'staging', 'production') */
  environment: string;
  /** Optional: comma-separated list of regression groups to run */
  groups?: string;
  /** Optional: timeout in seconds (default: 300) */
  timeoutSeconds?: number;
}

/**
 * Parsed result from the regression suite CLI output.
 */
export interface RegressionSuiteResult {
  /** Total number of test cases */
  total: number;
  /** Number of passing tests */
  passed: number;
  /** Number of failing tests */
  failed: number;
  /** Individual test case failures */
  failures: RegressionFailure[];
  /** Whether all tests passed */
  allPassed: boolean;
}

/**
 * Details of a single regression test failure.
 */
export interface RegressionFailure {
  /** Seed ID that failed */
  seedId: number;
  /** Execution mode */
  mode: string;
  /** Expected failure class */
  expected: string;
  /** Actual failure class (if available) */
  actual?: string;
  /** Error message (if available) */
  error?: string;
}

/**
 * Parses the structured output from the crashlab regression-suite CLI.
 *
 * Expected format:
 * ```
 * ::group::Regression Suite Results
 * Total: 312
 * Passed: 310
 * Failed: 2
 * ::endgroup::
 * ```
 *
 * @param output - The stdout from the CLI command
 * @returns Parsed regression suite result
 */
export function parseRegressionOutput(output: string): RegressionSuiteResult {
  const lines = output.split('\n');
  let total = 0;
  let passed = 0;
  let failed = 0;
  const failures: RegressionFailure[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Parse summary lines
    if (trimmed.startsWith('Total:')) {
      total = parseInt(trimmed.substring(6).trim(), 10) || 0;
    } else if (trimmed.startsWith('Passed:')) {
      passed = parseInt(trimmed.substring(7).trim(), 10) || 0;
    } else if (trimmed.startsWith('Failed:')) {
      failed = parseInt(trimmed.substring(7).trim(), 10) || 0;
    }

    // Parse error lines: ::error::Seed 99 (invoker): expected wrong-class, got runtime-failure
    if (trimmed.startsWith('::error::Seed ')) {
      const match = trimmed.match(/::error::Seed (\d+) \(([^)]+)\): (.+)/);
      if (match) {
        const seedId = parseInt(match[1], 10);
        const mode = match[2];
        const message = match[3];

        // Try to parse expected/actual from message
        const expectedActualMatch = message.match(/expected ([^,]+), got (.+)/);
        if (expectedActualMatch) {
          failures.push({
            seedId,
            mode,
            expected: expectedActualMatch[1],
            actual: expectedActualMatch[2],
          });
        } else {
          failures.push({
            seedId,
            mode,
            expected: '',
            error: message,
          });
        }
      }
    }
  }

  return {
    total,
    passed,
    failed,
    failures,
    allPassed: failed === 0 && total > 0,
  };
}

/**
 * Validates a CI regression configuration.
 *
 * @param config - The configuration to validate
 * @returns Validation result with any errors
 */
export function validateRegressionConfig(config: CIRegressionConfig): ResultValidation {
  const errors: string[] = [];

  if (!config.fixturePath) {
    errors.push('fixturePath is required');
  }

  if (!config.gitRef) {
    errors.push('gitRef is required');
  }

  if (!config.environment) {
    errors.push('environment is required');
  }

  if (config.timeoutSeconds !== undefined && config.timeoutSeconds <= 0) {
    errors.push('timeoutSeconds must be positive');
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Formats a regression suite result as a human-readable summary.
 *
 * @param result - The regression suite result to format
 * @returns Formatted summary string
 */
export function formatRegressionSummary(result: RegressionSuiteResult): string {
  if (result.allPassed) {
    return `✅ All ${result.total} regression tests passed`;
  }

  const lines: string[] = [
    `❌ ${result.failed} of ${result.total} regression tests failed`,
    '',
    'Failed tests:',
  ];

  for (const failure of result.failures) {
    if (failure.actual) {
      lines.push(
        `  - Seed ${failure.seedId} (${failure.mode}): expected ${failure.expected}, got ${failure.actual}`
      );
    } else if (failure.error) {
      lines.push(`  - Seed ${failure.seedId} (${failure.mode}): ${failure.error}`);
    } else {
      lines.push(`  - Seed ${failure.seedId} (${failure.mode}): test failed`);
    }
  }

  return lines.join('\n');
}

/**
 * Determines if a regression result should block deployment.
 *
 * @param result - The regression suite result
 * @returns true if deployment should be blocked (any failures)
 */
export function shouldBlockDeployment(result: RegressionSuiteResult): boolean {
  return !result.allPassed;
}
