/**
 * Issue #882 – [integration] Add PagerDuty alert integration for critical failures
 *
 * Pure utility functions extracted from IntegratePagerdutyAlertIntegration.
 * Free of React/browser dependencies for deterministic unit testing.
 */

export type PagerDutySeverity = 'critical' | 'error' | 'warning' | 'info';

export interface PagerDutyConfig {
  /** PagerDuty Events API v2 integration key (routing key). */
  integrationKey: string;
  /** Default severity level for triggered alerts. */
  defaultSeverity: PagerDutySeverity;
  /** Friendly name shown in PagerDuty for alerts from this source. */
  serviceSource: string;
  /** Whether PagerDuty alerting is currently enabled. */
  enabled: boolean;
  /** Minimum crash-run failure count before an alert is auto-triggered. */
  alertThreshold: number;
}

export interface PagerDutyConfigValidation {
  isValid: boolean;
  errors: string[];
}

export interface PagerDutyAlert {
  id: string;
  runId: string;
  signature: string;
  severity: PagerDutySeverity;
  triggeredAt: string;
  status: 'triggered' | 'acknowledged' | 'resolved';
  dedupKey: string;
  pdIncidentKey?: string;
}

export interface AlertSummary {
  total: number;
  triggered: number;
  acknowledged: number;
  resolved: number;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Validates a PagerDuty configuration object. */
export function validatePagerDutyConfig(config: PagerDutyConfig): PagerDutyConfigValidation {
  const errors: string[] = [];

  if (!config.integrationKey) {
    errors.push('Integration key is required');
  } else if (!/^[a-zA-Z0-9+/]{32,}$/.test(config.integrationKey.trim())) {
    errors.push(
      'Integration key appears invalid – it should be at least 32 alphanumeric characters',
    );
  }

  if (!config.serviceSource || config.serviceSource.trim().length === 0) {
    errors.push('Service source name is required');
  }

  const validSeverities: PagerDutySeverity[] = ['critical', 'error', 'warning', 'info'];
  if (!validSeverities.includes(config.defaultSeverity)) {
    errors.push(`defaultSeverity must be one of: ${validSeverities.join(', ')}`);
  }

  if (!Number.isInteger(config.alertThreshold) || config.alertThreshold < 1) {
    errors.push('alertThreshold must be a positive integer');
  }

  return { isValid: errors.length === 0, errors };
}

/** Returns true when the integration key passes the basic format check. */
export function isIntegrationKeyReachable(integrationKey: string): boolean {
  return integrationKey.trim().length >= 32;
}

// ---------------------------------------------------------------------------
// Alert helpers
// ---------------------------------------------------------------------------

/** Builds a stable dedup-key for a given fuzzing run + crash signature pair. */
export function buildDedupKey(runId: string, signature: string): string {
  return `soroban-crashlab:${runId}:${signature}`;
}

/** Validates a single PagerDutyAlert object for required observable fields. */
export function validatePagerDutyAlert(alert: PagerDutyAlert): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!alert.id) errors.push('id is required');
  if (!alert.runId) errors.push('runId is required');
  if (!alert.signature) errors.push('signature is required');
  if (!alert.dedupKey) errors.push('dedupKey is required');

  if (!alert.triggeredAt) {
    errors.push('triggeredAt is required');
  } else {
    const d = new Date(alert.triggeredAt);
    if (isNaN(d.getTime())) errors.push('triggeredAt must be a valid ISO date');
  }

  const validStatuses: PagerDutyAlert['status'][] = ['triggered', 'acknowledged', 'resolved'];
  if (!validStatuses.includes(alert.status)) {
    errors.push(`status must be one of: ${validStatuses.join(', ')}`);
  }

  const validSeverities: PagerDutySeverity[] = ['critical', 'error', 'warning', 'info'];
  if (!validSeverities.includes(alert.severity)) {
    errors.push(`severity must be one of: ${validSeverities.join(', ')}`);
  }

  return { isValid: errors.length === 0, errors };
}

/** Aggregates alert status counts. */
export function summariseAlerts(alerts: PagerDutyAlert[]): AlertSummary {
  return alerts.reduce<AlertSummary>(
    (acc, a) => ({
      total: acc.total + 1,
      triggered: acc.triggered + (a.status === 'triggered' ? 1 : 0),
      acknowledged: acc.acknowledged + (a.status === 'acknowledged' ? 1 : 0),
      resolved: acc.resolved + (a.status === 'resolved' ? 1 : 0),
    }),
    { total: 0, triggered: 0, acknowledged: 0, resolved: 0 },
  );
}

/** Formats an ISO timestamp for display. Returns the original string if invalid. */
export function formatAlertTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

/** Maps a PagerDuty alert status to a human-readable badge label. */
export function alertStatusLabel(status: PagerDutyAlert['status']): string {
  const labels: Record<PagerDutyAlert['status'], string> = {
    triggered: 'Triggered',
    acknowledged: 'Acknowledged',
    resolved: 'Resolved',
  };
  return labels[status] ?? status;
}

/** Returns a CSS colour token name appropriate for the given severity. */
export function severityColour(severity: PagerDutySeverity): string {
  const colours: Record<PagerDutySeverity, string> = {
    critical: 'red',
    error: 'orange',
    warning: 'yellow',
    info: 'blue',
  };
  return colours[severity] ?? 'zinc';
}
