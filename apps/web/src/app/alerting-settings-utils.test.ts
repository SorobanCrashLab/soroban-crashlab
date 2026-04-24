import * as assert from 'node:assert/strict';
import { toggleAlert, updateAlertThreshold, validateAlerts, AlertConfig } from './alerting-settings-utils';

const initialAlerts: AlertConfig[] = [
  {
    id: 'crash-rate-spike',
    name: 'Crash Rate Spike',
    description: 'Alert when the crash rate increases.',
    enabled: false,
    threshold: 15,
    unit: '%',
  },
  {
    id: 'consecutive-failures',
    name: 'Consecutive Failures',
    description: 'Alert on consecutive failures.',
    enabled: true,
    threshold: 5,
    unit: 'runs',
  }
];

const runAssertions = (): void => {
  // Test toggle
  const toggled = toggleAlert(initialAlerts, 'crash-rate-spike');
  assert.equal(toggled[0].enabled, true);
  assert.equal(initialAlerts[0].enabled, false); // pure

  // Test update threshold
  const updated = updateAlertThreshold(initialAlerts, 'consecutive-failures', 10);
  assert.equal(updated[1].threshold, 10);

  // Test validation - valid
  assert.equal(validateAlerts(initialAlerts), null);

  // Test validation - edge case: negative threshold
  const negativeThreshold = updateAlertThreshold(initialAlerts, 'consecutive-failures', -1);
  assert.equal(validateAlerts(negativeThreshold), 'Invalid threshold for Consecutive Failures. Must be a non-negative number.');

  // Test validation - edge case: percentage exceeds 100
  const overPercent = toggleAlert(updateAlertThreshold(initialAlerts, 'crash-rate-spike', 150), 'crash-rate-spike');
  assert.equal(validateAlerts(overPercent), 'Threshold for Crash Rate Spike cannot exceed 100%.');

  // Test validation - edge case: disabled alerts skip validation
  const disabledInvalid = updateAlertThreshold(initialAlerts, 'crash-rate-spike', -10);
  // disabled alert should bypass negative threshold error
  assert.equal(validateAlerts(disabledInvalid), null);
};

runAssertions();
console.log('alerting-settings-utils.test.ts: all assertions passed');
