/**
 * Integrate Run->issue link integration tests
 *
 * Pure utility functions extracted from IntegrateRunIssueLinkIntegrationTests.
 * Free of React/browser dependencies for deterministic unit testing.
 */

export interface IssueTracker {
  id: string;
  name: string;
  type: "github" | "jira" | "linear";
  baseUrl: string;
  enabled: boolean;
}

export interface IntegrationTest {
  id: string;
  name: string;
  status: "pending" | "running" | "passed" | "failed";
  duration?: number;
  error?: string;
}

import type { RunIssueLink } from './types';

export interface TrackerValidation {
  isValid: boolean;
  errors: string[];
}

/** Validates an IssueTracker object */
export function validateTracker(tracker: IssueTracker): TrackerValidation {
  const errors: string[] = [];

  if (!tracker.id) errors.push('ID is required');
  if (!tracker.name) errors.push('Name is required');
  
  if (!['github', 'jira', 'linear'].includes(tracker.type)) {
    errors.push('Type must be github, jira, or linear');
  }

  if (!tracker.baseUrl) {
    errors.push('Base URL is required');
  } else if (!tracker.baseUrl.startsWith('http://') && !tracker.baseUrl.startsWith('https://')) {
    errors.push('Base URL must start with http:// or https://');
  }

  return { isValid: errors.length === 0, errors };
}

/** Builds an issue link given a tracker and issue number */
export function buildIssueLink(tracker: IssueTracker, issueNumber: string): RunIssueLink {
  return {
    label: `${tracker.type.toUpperCase()}-${issueNumber}`,
    href: `${tracker.baseUrl}/${issueNumber}`
  };
}

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  running: number;
  pending: number;
}

/** Aggregates test statuses */
export function summariseTests(tests: IntegrationTest[]): TestSummary {
  return tests.reduce<TestSummary>(
    (acc, test) => {
      acc.total += 1;
      acc[test.status] += 1;
      return acc;
    },
    { total: 0, passed: 0, failed: 0, running: 0, pending: 0 }
  );
}

/**
 * Returns a new array of trackers where the tracker with the matching id
 * has its `enabled` property toggled.
 */
export function toggleTrackerEnabled(trackers: IssueTracker[], id: string): IssueTracker[] {
  return trackers.map(tracker => 
    tracker.id === id ? { ...tracker, enabled: !tracker.enabled } : tracker
  );
}

export interface RunIssueRecord {
  id: string;
  issues: RunIssueLink[];
}

/**
 * External-system contracts for Run -> issue-link integration.
 *
 * Required behavior:
 * - `getRunById` returns null when the run is unknown.
 * - `getEnabledTrackerById` returns null when tracker config is missing/disabled.
 * - `createRunIssueLink` persists or returns the new link for the run.
 * - `verifyIssueLink` returns reachability details from the downstream issue service.
 */
export interface RunIssueLinkDependencies {
  getRunById(runId: string): Promise<RunIssueRecord | null>;
  getEnabledTrackerById(trackerId: string): Promise<IssueTracker | null>;
  createRunIssueLink(args: {
    runId: string;
    tracker: IssueTracker;
    issueNumber: string;
  }): Promise<RunIssueLink>;
  verifyIssueLink(link: RunIssueLink): Promise<{ reachable: boolean; statusCode: number }>;
}

export interface RunIssueLinkFlowInput {
  runId: string;
  trackerId: string;
  issueNumber: string;
}

export interface RunIssueLinkFlowResult {
  success: boolean;
  link?: RunIssueLink;
  tests: IntegrationTest[];
}

function passStep(id: string, name: string): IntegrationTest {
  return { id, name, status: "passed" };
}

function failStep(id: string, name: string, error: string): IntegrationTest {
  return { id, name, status: "failed", error };
}

/**
 * Deterministic integration-flow test runner for Run -> issue linking.
 *
 * This function executes the same boundary checks a maintainer would verify
 * manually, but in a reproducible order with explicit failed-step reporting.
 */
export async function runIssueLinkIntegrationFlow(
  input: RunIssueLinkFlowInput,
  deps: RunIssueLinkDependencies,
): Promise<RunIssueLinkFlowResult> {
  const tests: IntegrationTest[] = [];

  if (!input.runId || !input.trackerId || !input.issueNumber) {
    tests.push(
      failStep("config-validation", "Validate integration input", "Missing runId, trackerId, or issueNumber"),
    );
    return { success: false, tests };
  }

  const run = await deps.getRunById(input.runId);
  if (!run) {
    tests.push(failStep("run-lookup", "Resolve run by ID", `Run ${input.runId} not found`));
    return { success: false, tests };
  }
  tests.push(passStep("run-lookup", "Resolve run by ID"));

  const tracker = await deps.getEnabledTrackerById(input.trackerId);
  if (!tracker) {
    tests.push(failStep("tracker-lookup", "Resolve enabled tracker", `Tracker ${input.trackerId} is unavailable`));
    return { success: false, tests };
  }

  const trackerValidation = validateTracker(tracker);
  if (!trackerValidation.isValid || !tracker.enabled) {
    tests.push(
      failStep(
        "tracker-validation",
        "Validate tracker configuration",
        trackerValidation.errors[0] ?? "Tracker must be enabled",
      ),
    );
    return { success: false, tests };
  }
  tests.push(passStep("tracker-validation", "Validate tracker configuration"));

  const expectedLink = buildIssueLink(tracker, input.issueNumber);
  if (run.issues.some((issue) => issue.href === expectedLink.href)) {
    tests.push(
      failStep("dedupe-check", "Check duplicate run->issue link", "Issue link already attached to run"),
    );
    return { success: false, tests };
  }
  tests.push(passStep("dedupe-check", "Check duplicate run->issue link"));

  const created = await deps.createRunIssueLink({
    runId: run.id,
    tracker,
    issueNumber: input.issueNumber,
  });
  if (!created?.href || !created?.label) {
    tests.push(failStep("link-create", "Persist run->issue link", "Created link payload is incomplete"));
    return { success: false, tests };
  }
  tests.push(passStep("link-create", "Persist run->issue link"));

  const verification = await deps.verifyIssueLink(created);
  if (!verification.reachable || verification.statusCode >= 400) {
    tests.push(
      failStep(
        "link-verify",
        "Verify downstream issue endpoint",
        `Downstream status ${verification.statusCode}`,
      ),
    );
    return { success: false, link: created, tests };
  }
  tests.push(passStep("link-verify", "Verify downstream issue endpoint"));

  return { success: true, link: created, tests };
}
