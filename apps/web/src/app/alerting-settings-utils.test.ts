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

  // Test toggle unknown id returns unchanged list
  const toggledUnknown = toggleAlert(initialAlerts, 'unknown-id');
  assert.deepEqual(toggledUnknown, initialAlerts);

  // Test update threshold
  const updated = updateAlertThreshold(initialAlerts, 'consecutive-failures', 10);
  assert.equal(updated[1].threshold, 10);

  // Test update threshold with string value
  const updatedStr = updateAlertThreshold(initialAlerts, 'consecutive-failures', '7');
  assert.equal(updatedStr[1].threshold, 7);

  // Test update threshold unknown id returns unchanged list
  const updatedUnknown = updateAlertThreshold(initialAlerts, 'unknown-id', 99);
  assert.deepEqual(updatedUnknown, initialAlerts);

  // Test validation - valid alerts pass
  assert.equal(validateAlerts(initialAlerts), null);

  // Test validation - empty list is valid
  assert.equal(validateAlerts([]), null);

  // Test validation - edge case: negative threshold on enabled alert
  const negativeThreshold = updateAlertThreshold(initialAlerts, 'consecutive-failures', -1);
  assert.equal(validateAlerts(negativeThreshold), 'Invalid threshold for Consecutive Failures. Must be a non-negative number.');

  // Test validation - edge case: percentage exceeds 100 on enabled alert
  const overPercent = toggleAlert(updateAlertThreshold(initialAlerts, 'crash-rate-spike', 150), 'crash-rate-spike');
  assert.equal(validateAlerts(overPercent), 'Threshold for Crash Rate Spike cannot exceed 100%.');

  // Test validation - disabled alerts skip threshold validation
  const disabledInvalid = updateAlertThreshold(initialAlerts, 'crash-rate-spike', -10);
  assert.equal(validateAlerts(disabledInvalid), null);

  // Test validation - zero threshold is valid (boundary)
  const zeroThreshold = updateAlertThreshold(initialAlerts, 'consecutive-failures', 0);
  assert.equal(validateAlerts(zeroThreshold), null);

  // Test validation - exactly 100% threshold is valid (boundary)
  const maxPercent = toggleAlert(updateAlertThreshold(initialAlerts, 'crash-rate-spike', 100), 'crash-rate-spike');
  assert.equal(validateAlerts(maxPercent), null);
};

runAssertions();
console.log('alerting-settings-utils.test.ts: all assertions passed');
