import * as assert from 'node:assert/strict';
import {
  ALERTING_TABS,
  buildAlertingSettingsSummary,
  createDefaultAlertingSettingsSnapshot,
  filterAlertRulesByCategory,
  formatRelativeTime,
  getNextAlertingTab,
  readAlertingSettingsSnapshot,
  serializeAlertingSettingsSnapshot,
  toggleAlertRule,
  toggleNotificationChannel,
  updateAlertRuleThreshold,
  validateAlertingSettingsSnapshot,
  type AlertingSettingsSnapshot,
  type AlertingTabId,
} from './alerting-settings-page-utils';

const referenceTime = new Date('2026-04-27T12:00:00.000Z');

// --------------------------------------------------------------------------
// Default snapshot & summary
// --------------------------------------------------------------------------

function testDefaultSnapshotShape(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);

  assert.equal(snapshot.alertRules.length, 5);
  assert.equal(snapshot.channels.length, 4);
  assert.equal(snapshot.history.length, 3);
  assert.equal(snapshot.lastUpdated, referenceTime.toISOString());

  const summary = buildAlertingSettingsSummary(snapshot);
  assert.equal(summary.totalRules, 5);
  assert.equal(summary.activeRules, 4);
  assert.equal(summary.enabledChannels, 3);
  assert.equal(summary.criticalRules, 2);
  assert.equal(summary.recentHistoryEntries, 3);
}

function testDefaultSnapshotNoArg(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot();
  assert.ok(snapshot.alertRules.length > 0);
  assert.ok(typeof snapshot.lastUpdated === 'string');
}

function testSummaryAfterToggle(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const toggled = toggleAlertRule(snapshot, 'crash-rate-spike');
  const summary = buildAlertingSettingsSummary(toggled);
  assert.equal(summary.activeRules, 3, 'one rule toggled off');
}

// --------------------------------------------------------------------------
// Serialize / read round trip
// --------------------------------------------------------------------------

function testSnapshotPersistenceRoundTrip(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const serialized = serializeAlertingSettingsSnapshot(snapshot);
  const result = readAlertingSettingsSnapshot(serialized, referenceTime);

  assert.equal(result.status, 'success');
  assert.ok(result.snapshot);
  assert.equal(result.snapshot?.alertRules.length, snapshot.alertRules.length);
  assert.equal(result.snapshot?.channels.length, snapshot.channels.length);
  assert.equal(result.snapshot?.history.length, snapshot.history.length);
}

function testReadNullInput(): void {
  const result = readAlertingSettingsSnapshot(null, referenceTime);
  assert.equal(result.status, 'success');
  assert.ok(result.snapshot);
}

// --------------------------------------------------------------------------
// Invalid / corrupted data handling
// --------------------------------------------------------------------------

function testInvalidJsonHandling(): void {
  const invalidJson = readAlertingSettingsSnapshot('{ not valid json }', referenceTime);
  assert.equal(invalidJson.status, 'error');
  assert.match(invalidJson.error ?? '', /valid JSON/i);
}

function testCorruptedShapeHandling(): void {
  const corruptedShape = readAlertingSettingsSnapshot(
    JSON.stringify({
      alertRules: [
        {
          id: 'broken',
          name: 'Broken',
          description: 'Broken',
          category: 'reliability',
          enabled: true,
          severity: 'high',
          condition: 'threshold',
          threshold: 15,
          unit: '%',
          channels: ['email'],
          cooldown: 30,
          tags: ['broken'],
          createdAt: referenceTime.toISOString(),
        },
      ],
      channels: 'invalid',
      history: [],
      lastUpdated: referenceTime.toISOString(),
    }),
    referenceTime,
  );
  assert.equal(corruptedShape.status, 'error');
  assert.match(corruptedShape.error ?? '', /incomplete or outdated/i);
}

function testReadNonObjectJson(): void {
  const result = readAlertingSettingsSnapshot('"just a string"', referenceTime);
  assert.equal(result.status, 'error');
  assert.match(result.error ?? '', /missing required data/i);
}

// --------------------------------------------------------------------------
// Keyboard tab navigation
// --------------------------------------------------------------------------

function testKeyboardTabNavigation(): void {
  assert.equal(getNextAlertingTab('rules', 'ArrowRight'), 'channels');
  assert.equal(getNextAlertingTab('channels', 'ArrowRight'), 'history');
  assert.equal(getNextAlertingTab('history', 'ArrowRight'), 'rules');
  assert.equal(getNextAlertingTab('rules', 'ArrowLeft'), 'history');
  assert.equal(getNextAlertingTab('channels', 'Home'), 'rules');
  assert.equal(getNextAlertingTab('channels', 'End'), 'history');
  assert.deepEqual(ALERTING_TABS, ['rules', 'channels', 'history']);
}

function testKeyboardTabArrowUp(): void {
  assert.equal(getNextAlertingTab('rules', 'ArrowUp'), 'history');
  assert.equal(getNextAlertingTab('history', 'ArrowUp'), 'channels');
}

function testKeyboardTabArrowDown(): void {
  assert.equal(getNextAlertingTab('rules', 'ArrowDown'), 'channels');
}

function testKeyboardTabUnknownTab(): void {
  const result = getNextAlertingTab('unknown-tab' as AlertingTabId, 'ArrowRight');
  assert.equal(result, 'rules');
}

function testKeyboardTabUnknownKey(): void {
  assert.equal(getNextAlertingTab('rules', 'Enter'), 'rules');
  assert.equal(getNextAlertingTab('channels', 'Tab'), 'channels');
}

// --------------------------------------------------------------------------
// toggleAlertRule
// --------------------------------------------------------------------------

function testToggleRuleOn(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const rule = snapshot.alertRules.find((r) => r.id === 'crash-rate-spike');
  assert.ok(rule?.enabled, 'initially enabled');

  const toggled = toggleAlertRule(snapshot, 'crash-rate-spike');
  const toggledRule = toggled.alertRules.find((r) => r.id === 'crash-rate-spike');
  assert.equal(toggledRule?.enabled, false, 'toggled off');
}

function testToggleRuleOff(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const toggleOff = toggleAlertRule(snapshot, 'crash-rate-spike');
  const toggleOn = toggleAlertRule(toggleOff, 'crash-rate-spike');
  const rule = toggleOn.alertRules.find((r) => r.id === 'crash-rate-spike');
  assert.equal(rule?.enabled, true, 'toggled back on');
}

function testToggleRuleUnknownId(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const toggled = toggleAlertRule(snapshot, 'nonexistent-rule');
  assert.equal(toggled.alertRules.length, snapshot.alertRules.length);
  toggled.alertRules.forEach((rule, i) => {
    assert.equal(rule.enabled, snapshot.alertRules[i].enabled);
  });
}

function testToggleRuleDoesNotMutateOriginal(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const rule = snapshot.alertRules.find((r) => r.id === 'crash-rate-spike');
  const originalEnabled = rule?.enabled;
  toggleAlertRule(snapshot, 'crash-rate-spike');
  assert.equal(rule?.enabled, originalEnabled, 'original unchanged');
}

// --------------------------------------------------------------------------
// toggleNotificationChannel
// --------------------------------------------------------------------------

function testToggleChannelOn(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const channel = snapshot.channels.find((c) => c.id === 'webhook-monitoring');
  assert.equal(channel?.enabled, false, 'initially disabled');

  const toggled = toggleNotificationChannel(snapshot, 'webhook-monitoring');
  const toggledChannel = toggled.channels.find((c) => c.id === 'webhook-monitoring');
  assert.equal(toggledChannel?.enabled, true, 'toggled on');
}

function testToggleChannelOff(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const toggled = toggleNotificationChannel(snapshot, 'email-primary');
  const ch = toggled.channels.find((c) => c.id === 'email-primary');
  assert.equal(ch?.enabled, false, 'toggled off');
}

function testToggleChannelUnknownId(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const toggled = toggleNotificationChannel(snapshot, 'nonexistent-channel');
  assert.equal(toggled.channels.length, snapshot.channels.length);
}

// --------------------------------------------------------------------------
// updateAlertRuleThreshold
// --------------------------------------------------------------------------

function testUpdateThresholdNumeric(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const updated = updateAlertRuleThreshold(snapshot, 'crash-rate-spike', 42);
  const rule = updated.alertRules.find((r) => r.id === 'crash-rate-spike');
  assert.equal(rule?.threshold, 42);
}

function testUpdateThresholdString(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const updated = updateAlertRuleThreshold(snapshot, 'crash-rate-spike', '99');
  const rule = updated.alertRules.find((r) => r.id === 'crash-rate-spike');
  assert.equal(rule?.threshold, 99);
}

function testUpdateThresholdThresholdNonNumericString(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const original = snapshot.alertRules.find((r) => r.id === 'crash-rate-spike');
  const updated = updateAlertRuleThreshold(snapshot, 'crash-rate-spike', 'not-a-number');
  const rule = updated.alertRules.find((r) => r.id === 'crash-rate-spike');
  assert.equal(rule?.threshold, original?.threshold, 'threshold unchanged for non-numeric string');
}

function testUpdateThresholdNumericString(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const updated = updateAlertRuleThreshold(snapshot, 'crash-rate-spike', '42');
  const rule = updated.alertRules.find((r) => r.id === 'crash-rate-spike');
  assert.equal(rule?.threshold, 42);
}

function testUpdateThresholdNumericStringWithWhitespace(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const updated = updateAlertRuleThreshold(snapshot, 'crash-rate-spike', '  42  ');
  const rule = updated.alertRules.find((r) => r.id === 'crash-rate-spike');
  assert.equal(rule?.threshold, 42);
}

function testUpdateThresholdNegative(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const updated = updateAlertRuleThreshold(snapshot, 'crash-rate-spike', -5);
  const rule = updated.alertRules.find((r) => r.id === 'crash-rate-spike');
  assert.equal(rule?.threshold, -5);
}

function testUpdateThresholdUnknownId(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const updated = updateAlertRuleThreshold(snapshot, 'nonexistent', 50);
  assert.deepEqual(updated.alertRules, snapshot.alertRules);
}

// --------------------------------------------------------------------------
// filterAlertRulesByCategory
// --------------------------------------------------------------------------

function testFilterByCategorySecurity(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const filtered = filterAlertRulesByCategory(snapshot.alertRules, 'security');
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].category, 'security');
}

function testFilterByCategoryAll(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const filtered = filterAlertRulesByCategory(snapshot.alertRules, 'all');
  assert.equal(filtered.length, snapshot.alertRules.length);
}

function testFilterByCategoryEmptyMatch(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const filtered = filterAlertRulesByCategory(snapshot.alertRules, 'performance');
  assert.ok(filtered.length > 0);
  filtered.forEach((r) => assert.equal(r.category, 'performance'));
}

function testFilterByCategoryNoMatch(): void {
  const emptyRules: ReturnType<typeof createDefaultAlertingSettingsSnapshot>['alertRules'] = [];
  const filtered = filterAlertRulesByCategory(emptyRules, 'reliability');
  assert.deepEqual(filtered, []);
}

// --------------------------------------------------------------------------
// formatRelativeTime
// --------------------------------------------------------------------------

function testFormatRelativeUndefined(): void {
  assert.equal(formatRelativeTime(undefined, referenceTime), '');
}

function testFormatRelativeInvalid(): void {
  assert.equal(formatRelativeTime('not-a-date', referenceTime), '');
}

function testFormatRelativeJustNow(): void {
  const timestamp = new Date(referenceTime.getTime() - 30 * 1000).toISOString();
  assert.match(formatRelativeTime(timestamp, referenceTime), /just now/i);
}

function testFormatRelativeMinutes(): void {
  const timestamp = new Date(referenceTime.getTime() - 5 * 60 * 1000).toISOString();
  assert.match(formatRelativeTime(timestamp, referenceTime), /5 m/i);
}

function testFormatRelativeHours(): void {
  const timestamp = new Date(referenceTime.getTime() - 3 * 60 * 60 * 1000).toISOString();
  assert.match(formatRelativeTime(timestamp, referenceTime), /3h/i);
}

function testFormatRelativeDays(): void {
  const timestamp = new Date(referenceTime.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
  assert.match(formatRelativeTime(timestamp, referenceTime), /2d/i);
}

// --------------------------------------------------------------------------
// validateAlertingSettingsSnapshot
// --------------------------------------------------------------------------

function testValidateValidSnapshot(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const result = validateAlertingSettingsSnapshot(snapshot);
  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
}

function testValidateMissingFields(): void {
  const result = validateAlertingSettingsSnapshot({} as unknown as AlertingSettingsSnapshot);
  assert.equal(result.valid, false);
  assert.ok(result.issues.length > 0);
}

// --------------------------------------------------------------------------
// Runner
// --------------------------------------------------------------------------

const tests = [
  testDefaultSnapshotShape,
  testDefaultSnapshotNoArg,
  testSummaryAfterToggle,
  testSnapshotPersistenceRoundTrip,
  testReadNullInput,
  testInvalidJsonHandling,
  testCorruptedShapeHandling,
  testReadNonObjectJson,
  testKeyboardTabNavigation,
  testKeyboardTabArrowUp,
  testKeyboardTabArrowDown,
  testKeyboardTabUnknownTab,
  testKeyboardTabUnknownKey,
  testToggleRuleOn,
  testToggleRuleOff,
  testToggleRuleUnknownId,
  testToggleRuleDoesNotMutateOriginal,
  testToggleChannelOn,
  testToggleChannelOff,
  testToggleChannelUnknownId,
  testUpdateThresholdNumeric,
  testUpdateThresholdString,
  testUpdateThresholdThresholdNonNumericString,
  testUpdateThresholdNumericString,
  testUpdateThresholdNumericStringWithWhitespace,
  testUpdateThresholdNegative,
  testUpdateThresholdUnknownId,
  testFilterByCategorySecurity,
  testFilterByCategoryAll,
  testFilterByCategoryEmptyMatch,
  testFilterByCategoryNoMatch,
  testFormatRelativeUndefined,
  testFormatRelativeInvalid,
  testFormatRelativeJustNow,
  testFormatRelativeMinutes,
  testFormatRelativeHours,
  testFormatRelativeDays,
  testValidateValidSnapshot,
  testValidateMissingFields,
];

for (const test of tests) {
  test();
}

console.log(`Alerting settings page utils tests: ${tests.length} passed`);
