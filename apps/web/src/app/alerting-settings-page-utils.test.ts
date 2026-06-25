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

// ---------------------------------------------------------------------------
// Default snapshot & summary
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Serialize / read round trip
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Invalid / corrupted data handling
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Keyboard tab navigation
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// toggleAlertRule
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// toggleNotificationChannel
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// updateAlertRuleThreshold
// ---------------------------------------------------------------------------

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

function testUpdateThresholdNonNumericString(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const original = snapshot.alertRules.find((r) => r.id === 'crash-rate-spike');
  const updated = updateAlertRuleThreshold(snapshot, 'crash-rate-spike', 'not-a-number');
  const rule = updated.alertRules.find((r) => r.id === 'crash-rate-spike');
  assert.equal(rule?.threshold, original?.threshold, 'threshold unchanged for non-numeric string');
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

// ---------------------------------------------------------------------------
// filterAlertRulesByCategory
// ---------------------------------------------------------------------------

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
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const emptyRules: typeof snapshot.alertRules = [];
  const filtered = filterAlertRulesByCategory(emptyRules, 'reliability');
  assert.deepEqual(filtered, []);
}

// ---------------------------------------------------------------------------
// formatRelativeTime
// ---------------------------------------------------------------------------

function testFormatRelativeUndefined(): void {
  assert.equal(formatRelativeTime(undefined), 'Never');
}

function testFormatRelativeEmptyString(): void {
  assert.equal(formatRelativeTime(''), 'Never');
}

function testFormatRelativeInvalidDate(): void {
  assert.equal(formatRelativeTime('not-a-date'), 'Unknown');
}

function testFormatRelativeRecently(): void {
  const now = new Date('2026-04-27T12:00:00.000Z');
  const result = formatRelativeTime('2026-04-27T11:59:30.000Z', now);
  assert.equal(result, 'Recently');
}

function testFormatRelativeMinutes(): void {
  const now = new Date('2026-04-27T12:05:00.000Z');
  const result = formatRelativeTime('2026-04-27T12:03:00.000Z', now);
  assert.equal(result, '2m ago');
}

function testFormatRelativeHours(): void {
  const now = new Date('2026-04-27T15:00:00.000Z');
  const result = formatRelativeTime('2026-04-27T12:00:00.000Z', now);
  assert.equal(result, '3h ago');
}

function testFormatRelativeDays(): void {
  const now = new Date('2026-04-30T12:00:00.000Z');
  const result = formatRelativeTime('2026-04-27T12:00:00.000Z', now);
  assert.equal(result, '3d ago');
}

function testFormatRelativeFutureDate(): void {
  const now = new Date('2026-04-27T12:00:00.000Z');
  const result = formatRelativeTime('2026-04-28T12:00:00.000Z', now);
  assert.equal(result, 'Recently');
}

// ---------------------------------------------------------------------------
// validateAlertingSettingsSnapshot
// ---------------------------------------------------------------------------

function testValidateValidSnapshot(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  assert.equal(validateAlertingSettingsSnapshot(snapshot), null);
}

function testValidateEmptyRuleName(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const invalid = {
    ...snapshot,
    alertRules: snapshot.alertRules.map((r) =>
      r.id === 'crash-rate-spike' ? { ...r, name: '  ' } : r,
    ),
  };
  const err = validateAlertingSettingsSnapshot(invalid);
  assert.ok(err?.includes('name'), 'name required');
}

function testValidateNonFiniteThreshold(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const invalid = {
    ...snapshot,
    alertRules: snapshot.alertRules.map((r) =>
      r.id === 'crash-rate-spike' ? { ...r, threshold: NaN } : r,
    ),
  };
  const err = validateAlertingSettingsSnapshot(invalid);
  assert.ok(err?.includes('Threshold'), 'non-finite threshold rejected');
}

function testValidateZeroThreshold(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const invalid = {
    ...snapshot,
    alertRules: snapshot.alertRules.map((r) =>
      r.id === 'crash-rate-spike' ? { ...r, threshold: 0 } : r,
    ),
  };
  const err = validateAlertingSettingsSnapshot(invalid);
  assert.ok(err?.includes('must be greater than zero'), 'zero threshold rejected');
}

function testValidateNegativeThreshold(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const invalid = {
    ...snapshot,
    alertRules: snapshot.alertRules.map((r) =>
      r.id === 'crash-rate-spike' ? { ...r, threshold: -1 } : r,
    ),
  };
  const err = validateAlertingSettingsSnapshot(invalid);
  assert.ok(err?.includes('must be greater than zero'), 'negative threshold rejected');
}

function testValidatePercentExceeds100(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const invalid = {
    ...snapshot,
    alertRules: snapshot.alertRules.map((r) =>
      r.id === 'crash-rate-spike' ? { ...r, threshold: 150 } : r,
    ),
  };
  const err = validateAlertingSettingsSnapshot(invalid);
  assert.ok(err?.includes('cannot exceed 100%'), 'percent > 100 rejected');
}

function testValidateNegativeCooldown(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const invalid = {
    ...snapshot,
    alertRules: snapshot.alertRules.map((r) =>
      r.id === 'crash-rate-spike' ? { ...r, cooldown: -1 } : r,
    ),
  };
  const err = validateAlertingSettingsSnapshot(invalid);
  assert.ok(err?.includes('Cooldown'), 'negative cooldown rejected');
}

function testValidateZeroCooldown(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const modified = {
    ...snapshot,
    alertRules: snapshot.alertRules.map((r) =>
      r.id === 'crash-rate-spike' ? { ...r, cooldown: 0 } : r,
    ),
  };
  assert.equal(validateAlertingSettingsSnapshot(modified), null, 'zero cooldown valid');
}

function testValidateDisabledRuleSkipsValidation(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const modified = {
    ...snapshot,
    alertRules: snapshot.alertRules.map((r) =>
      r.id === 'crash-rate-spike' ? { ...r, enabled: false, threshold: -5 } : r,
    ),
  };
  assert.equal(validateAlertingSettingsSnapshot(modified), null, 'disabled rule skipped');
}

function testValidateNoChannels(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const invalid = { ...snapshot, channels: [] };
  const err = validateAlertingSettingsSnapshot(invalid);
  assert.ok(err?.includes('Add at least one'), 'no channels rejected');
}

function testValidateAllChannelsDisabled(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const invalid = {
    ...snapshot,
    channels: snapshot.channels.map((c) => ({ ...c, enabled: false })),
  };
  const err = validateAlertingSettingsSnapshot(invalid);
  assert.ok(err?.includes('Enable at least one'), 'all channels disabled rejected');
}

function testValidateValidAfterToggle(): void {
  const snapshot = createDefaultAlertingSettingsSnapshot(referenceTime);
  const toggled = toggleNotificationChannel(snapshot, 'email-primary');
  const toggledBack = toggleNotificationChannel(toggled, 'email-primary');
  assert.equal(validateAlertingSettingsSnapshot(toggledBack), null);
}

// ---------------------------------------------------------------------------
// buildAlertingSettingsSummary edge cases
// ---------------------------------------------------------------------------

function testSummaryEmptySnapshot(): void {
  const empty: AlertingSettingsSnapshot = {
    alertRules: [],
    channels: [],
    history: [],
    lastUpdated: referenceTime.toISOString(),
  };
  const summary = buildAlertingSettingsSummary(empty);
  assert.equal(summary.totalRules, 0);
  assert.equal(summary.activeRules, 0);
  assert.equal(summary.enabledChannels, 0);
  assert.equal(summary.criticalRules, 0);
  assert.equal(summary.recentHistoryEntries, 0);
}

// ---------------------------------------------------------------------------
// Run all
// ---------------------------------------------------------------------------

testDefaultSnapshotShape();
testDefaultSnapshotNoArg();
testSummaryAfterToggle();
testSnapshotPersistenceRoundTrip();
testReadNullInput();
testInvalidJsonHandling();
testCorruptedShapeHandling();
testReadNonObjectJson();
testKeyboardTabNavigation();
testKeyboardTabArrowUp();
testKeyboardTabArrowDown();
testKeyboardTabUnknownTab();
testKeyboardTabUnknownKey();
testToggleRuleOn();
testToggleRuleOff();
testToggleRuleUnknownId();
testToggleRuleDoesNotMutateOriginal();
testToggleChannelOn();
testToggleChannelOff();
testToggleChannelUnknownId();
testUpdateThresholdNumeric();
testUpdateThresholdString();
testUpdateThresholdNonNumericString();
testUpdateThresholdNegative();
testUpdateThresholdUnknownId();
testFilterByCategorySecurity();
testFilterByCategoryAll();
testFilterByCategoryEmptyMatch();
testFilterByCategoryNoMatch();
testFormatRelativeUndefined();
testFormatRelativeEmptyString();
testFormatRelativeInvalidDate();
testFormatRelativeRecently();
testFormatRelativeMinutes();
testFormatRelativeHours();
testFormatRelativeDays();
testFormatRelativeFutureDate();
testValidateValidSnapshot();
testValidateEmptyRuleName();
testValidateNonFiniteThreshold();
testValidateZeroThreshold();
testValidateNegativeThreshold();
testValidatePercentExceeds100();
testValidateNegativeCooldown();
testValidateZeroCooldown();
testValidateDisabledRuleSkipsValidation();
testValidateNoChannels();
testValidateAllChannelsDisabled();
testValidateValidAfterToggle();
testSummaryEmptySnapshot();

console.log('alerting-settings-page-utils.test.ts: all assertions passed');
