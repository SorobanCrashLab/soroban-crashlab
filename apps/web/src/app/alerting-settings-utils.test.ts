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
  },
];

// ---------------------------------------------------------------------------
// toggleAlert
// ---------------------------------------------------------------------------

function testToggleAlertOn(): void {
  const toggled = toggleAlert(initialAlerts, 'crash-rate-spike');
  assert.equal(toggled[0].enabled, true);
  assert.equal(initialAlerts[0].enabled, false); // pure
}

function testToggleAlertOff(): void {
  const toggledOn = toggleAlert(initialAlerts, 'crash-rate-spike');
  const toggledOff = toggleAlert(toggledOn, 'crash-rate-spike');
  assert.equal(toggledOff[0].enabled, false);
}

function testToggleAlertUnknownId(): void {
  const toggled = toggleAlert(initialAlerts, 'unknown-id');
  assert.deepEqual(toggled, initialAlerts);
}

function testToggleAlertDoesNotMutate(): void {
  const copy = [...initialAlerts];
  toggleAlert(initialAlerts, 'crash-rate-spike');
  assert.equal(initialAlerts[0].enabled, copy[0].enabled);
}

// ---------------------------------------------------------------------------
// updateAlertThreshold
// ---------------------------------------------------------------------------

function testUpdateThresholdNumeric(): void {
  const updated = updateAlertThreshold(initialAlerts, 'consecutive-failures', 10);
  assert.equal(updated[1].threshold, 10);
}

function testUpdateThresholdString(): void {
  const updated = updateAlertThreshold(initialAlerts, 'consecutive-failures', '7');
  assert.equal(updated[1].threshold, 7);
}

function testUpdateThresholdNonParsableString(): void {
  const updated = updateAlertThreshold(initialAlerts, 'consecutive-failures', 'abc');
  assert.equal(updated[1].threshold, 0, 'non-parsable string falls back to 0');
}

function testUpdateThresholdUnknownId(): void {
  const updated = updateAlertThreshold(initialAlerts, 'unknown-id', 99);
  assert.deepEqual(updated, initialAlerts);
}

function testUpdateThresholdZero(): void {
  const updated = updateAlertThreshold(initialAlerts, 'consecutive-failures', 0);
  assert.equal(updated[1].threshold, 0);
}

// ---------------------------------------------------------------------------
// validateAlerts
// ---------------------------------------------------------------------------

function testValidateValid(): void {
  assert.equal(validateAlerts(initialAlerts), null);
}

function testValidateEmptyList(): void {
  assert.equal(validateAlerts([]), null);
}

function testValidateNegativeThreshold(): void {
  const negative = updateAlertThreshold(initialAlerts, 'consecutive-failures', -1);
  const err = validateAlerts(negative);
  assert.equal(err, 'Invalid threshold for Consecutive Failures. Must be a non-negative number.');
}

function testValidatePercentExceeds100(): void {
  const over = toggleAlert(updateAlertThreshold(initialAlerts, 'crash-rate-spike', 150), 'crash-rate-spike');
  const err = validateAlerts(over);
  assert.equal(err, 'Threshold for Crash Rate Spike cannot exceed 100%.');
}

function testValidateDisabledAlertSkipsCheck(): void {
  const disabled = updateAlertThreshold(initialAlerts, 'crash-rate-spike', -10);
  assert.equal(validateAlerts(disabled), null);
}

function testValidateZeroThreshold(): void {
  const zero = updateAlertThreshold(initialAlerts, 'consecutive-failures', 0);
  assert.equal(validateAlerts(zero), null);
}

function testValidateExactly100Percent(): void {
  const max = toggleAlert(updateAlertThreshold(initialAlerts, 'crash-rate-spike', 100), 'crash-rate-spike');
  assert.equal(validateAlerts(max), null);
}

function testValidateNaNThreshold(): void {
  const nanThreshold = updateAlertThreshold(initialAlerts, 'consecutive-failures', NaN);
  const err = validateAlerts(nanThreshold);
  assert.ok(err?.includes('Invalid threshold'), 'NaN threshold rejected');
}

function testValidateMultipleAlertsFirstErrorWins(): void {
  const alerts: AlertConfig[] = [
    { id: 'a', name: 'Alert A', description: '', enabled: true, threshold: -5, unit: '%' },
    { id: 'b', name: 'Alert B', description: '', enabled: true, threshold: 200, unit: '%' },
  ];
  const err = validateAlerts(alerts);
  assert.ok(err?.includes('Alert A'), 'first error reported');
}

// ---------------------------------------------------------------------------
// Run all
// ---------------------------------------------------------------------------

testToggleAlertOn();
testToggleAlertOff();
testToggleAlertUnknownId();
testToggleAlertDoesNotMutate();
testUpdateThresholdNumeric();
testUpdateThresholdString();
testUpdateThresholdNonParsableString();
testUpdateThresholdUnknownId();
testUpdateThresholdZero();
testValidateValid();
testValidateEmptyList();
testValidateNegativeThreshold();
testValidatePercentExceeds100();
testValidateDisabledAlertSkipsCheck();
testValidateZeroThreshold();
testValidateExactly100Percent();
testValidateNaNThreshold();
testValidateMultipleAlertsFirstErrorWins();

console.log('alerting-settings-utils.test.ts: all assertions passed');
