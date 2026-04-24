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
