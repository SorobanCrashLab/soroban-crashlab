import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALERT_SEVERITIES,
  isWithinQuietHours,
  parseAlertPolicy,
  resolveRoute,
  type AlertSeverity,
} from './alert-policy';

const POLICY_PATH = path.resolve(__dirname, '../../../../../ops/alert-policies.yml');
const policySource = fs.readFileSync(POLICY_PATH, 'utf8');
const policy = parseAlertPolicy(policySource);

const DAYTIME = new Date('2026-10-16T12:00:00Z');
const NIGHT = new Date('2026-10-16T23:30:00Z');

function event(source: string, severity: AlertSeverity, fingerprint = 'fp-1') {
  return { source, severity, fingerprint, summary: `${source} ${severity}` };
}

describe('ops/alert-policies.yml schema (CI gate)', () => {
  it('parses and validates', () => {
    expect(policy.version).toBe(1);
    expect(policy.routes.at(-1)?.id).toBe('catch-all');
  });

  it('rejects a policy without a catch-all', () => {
    const broken = policySource.replace(/  - id: catch-all[\s\S]*$/, '');
    expect(() => parseAlertPolicy(broken)).toThrow(/catch-all/);
  });

  it('rejects unknown channels, duplicate ids and non-increasing escalation', () => {
    expect(() => parseAlertPolicy(policySource.replace('channels: [pagerduty, slack]', 'channels: [sms]'))).toThrow(
      /channels/,
    );
    expect(() => parseAlertPolicy(policySource.replace('id: slo-slow-burn', 'id: slo-fast-burn'))).toThrow(
      /duplicate route id/,
    );
    expect(() => parseAlertPolicy(policySource.replace('afterMinutes: 30', 'afterMinutes: 5'))).toThrow(
      /strictly increasing/,
    );
  });

  it('rejects escalation that starts before the ack SLA', () => {
    expect(() => parseAlertPolicy(policySource.replace('ackSlaMinutes: 10', 'ackSlaMinutes: 20'))).toThrow(
      /precedes the ack SLA/,
    );
  });
});

describe('routing matrix', () => {
  const matrix: Array<[string, AlertSeverity, string, string[]]> = [
    ['nightly-escalation', 'critical', 'nightly-critical', ['pagerduty', 'slack']],
    ['nightly-escalation', 'error', 'catch-all', ['slack']],
    ['nightly-escalation', 'warning', 'catch-all', ['slack']],
    ['nightly-escalation', 'info', 'catch-all', ['slack']],
    ['slo-burn', 'critical', 'slo-fast-burn', ['pagerduty', 'slack']],
    ['slo-burn', 'error', 'slo-fast-burn', ['pagerduty', 'slack']],
    ['slo-burn', 'warning', 'slo-slow-burn', ['slack']],
    ['slo-burn', 'info', 'slo-slow-burn', ['slack']],
    ['unknown-producer', 'critical', 'catch-all', ['slack']],
  ];

  it.each(matrix)('%s/%s → %s', (source, severity, routeId, channels) => {
    const decision = resolveRoute(policy, event(source, severity), DAYTIME);
    expect(decision.route.id).toBe(routeId);
    expect(decision.route.channels).toEqual(channels);
  });

  it('routes every source × severity somewhere', () => {
    for (const source of ['nightly-escalation', 'slo-burn', 'anything']) {
      for (const severity of ALERT_SEVERITIES) {
        expect(() => resolveRoute(policy, event(source, severity), DAYTIME)).not.toThrow();
      }
    }
  });

  it('builds dedup keys from the route fields and applies window/SLA defaults', () => {
    const fast = resolveRoute(policy, event('slo-burn', 'critical', 'availability'), DAYTIME);
    expect(fast.dedupKey).toBe('slo-fast-burn:slo-burn:availability');
    expect(fast.dedupWindowMinutes).toBe(30);
    expect(fast.ackSlaMinutes).toBe(15);

    const slow = resolveRoute(policy, event('slo-burn', 'warning', 'availability'), DAYTIME);
    expect(slow.dedupWindowMinutes).toBe(120);

    const nightly = resolveRoute(policy, event('nightly-escalation', 'critical'), DAYTIME);
    expect(nightly.ackSlaMinutes).toBe(10);
  });

  it('holds only quiet-hours routes at night', () => {
    expect(resolveRoute(policy, event('slo-burn', 'warning'), NIGHT).held).toBe(true);
    expect(resolveRoute(policy, event('slo-burn', 'critical'), NIGHT).held).toBe(false);
    expect(resolveRoute(policy, event('slo-burn', 'warning'), DAYTIME).held).toBe(false);
  });

  it('handles quiet hours wrapping midnight', () => {
    expect(isWithinQuietHours(policy, new Date('2026-10-16T22:00:00Z'))).toBe(true);
    expect(isWithinQuietHours(policy, new Date('2026-10-17T06:59:00Z'))).toBe(true);
    expect(isWithinQuietHours(policy, new Date('2026-10-17T07:00:00Z'))).toBe(false);
    expect(isWithinQuietHours(policy, new Date('2026-10-16T21:59:00Z'))).toBe(false);
  });
});
