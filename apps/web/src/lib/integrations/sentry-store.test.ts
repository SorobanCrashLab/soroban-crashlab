import { describe, it, expect } from 'vitest';
import { testSentryConnection, buildMockCrashReports } from './sentry-store';
import { validateCrashReport } from '../../features/integrations/integrate-sentry-integration-for-crash-reporting-utils';

describe('testSentryConnection', () => {
  it('rejects an empty DSN', () => {
    expect(testSentryConnection('')).toEqual({ success: false, error: 'DSN is required' });
  });

  it('rejects a DSN that does not look like Sentry', () => {
    const result = testSentryConnection('https://example.com/not-sentry');
    expect(result.success).toBe(false);
    expect(result.error).toContain('valid Sentry DSN');
  });

  it('accepts an ingest-style DSN', () => {
    expect(testSentryConnection('https://abc123@o123.ingest.sentry.io/456')).toEqual({
      success: true,
    });
  });

  it('accepts a sentry.io DSN', () => {
    expect(testSentryConnection('https://key@sentry.io/1')).toEqual({ success: true });
  });
});

describe('buildMockCrashReports', () => {
  it('returns a non-empty set of reports that all pass validateCrashReport', () => {
    const reports = buildMockCrashReports();
    expect(reports.length).toBeGreaterThan(0);
    for (const report of reports) {
      const validation = validateCrashReport(report);
      expect(validation.errors).toEqual([]);
      expect(validation.isValid).toBe(true);
    }
  });

  it('covers more than one status for a representative UI state', () => {
    const statuses = new Set(buildMockCrashReports().map((r) => r.status));
    expect(statuses.size).toBeGreaterThan(1);
  });
});
