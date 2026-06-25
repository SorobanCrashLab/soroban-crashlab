import * as assert from 'node:assert/strict';
import {
  ALERT_PRESETS,
  getPresetById,
  getPresetStatus,
  applyPreset,
  buildPresetsFromExisting,
  getPresetChannels,
  countPresetsByCategory,
  type AlertPreset,
  type PresetStatus,
} from './alerting-presets-utils';
import type { AlertRule } from './alerting-settings-page-utils';

// ALERT_PRESETS is non-empty and well-formed
assert.ok(ALERT_PRESETS.length > 0, 'ALERT_PRESETS must have at least one entry');
for (const preset of ALERT_PRESETS) {
  assert.ok(typeof preset.id === 'string' && preset.id.length > 0, `preset.id must be non-empty string`);
  assert.ok(typeof preset.name === 'string' && preset.name.length > 0, `preset.name must be non-empty`);
  assert.ok(typeof preset.description === 'string', `preset.description must be a string`);
  assert.ok(Array.isArray(preset.rules) && preset.rules.length > 0, `preset.rules must be a non-empty array`);
  assert.strictEqual(preset.ruleCount, preset.rules.length, `ruleCount must match rules.length`);
}

// getPresetById returns the correct preset
{
  const preset = getPresetById('security-hardening');
  assert.ok(preset !== undefined, 'security-hardening preset must exist');
  assert.strictEqual(preset!.id, 'security-hardening');
  assert.strictEqual(preset!.category, 'security');
}

// getPresetById returns undefined for unknown id
{
  const preset = getPresetById('nonexistent' as never);
  assert.strictEqual(preset, undefined);
}

// getPresetStatus returns 'available' when no existing rule ids match
{
  const preset = getPresetById('reliability-guard')!;
  const status = getPresetStatus(preset, new Set());
  assert.strictEqual(status, 'available');
}

// getPresetStatus returns 'applied' when all rules are present
{
  const preset = getPresetById('reliability-guard')!;
  const ids = new Set(preset.rules.map((r) => r.id));
  const status = getPresetStatus(preset, ids);
  assert.strictEqual(status, 'applied');
}

// getPresetStatus returns 'partial' when only some rules are present
{
  const preset = getPresetById('reliability-guard')!;
  const ids = new Set([preset.rules[0].id]);
  const status = getPresetStatus(preset, ids);
  assert.strictEqual(status, 'partial');
}

// applyPreset correctly separates added vs skipped rule ids
{
  const preset = getPresetById('performance-monitoring')!;
  const existingRules: AlertRule[] = [
    {
      ...preset.rules[0],
      createdAt: new Date().toISOString(),
    } as AlertRule,
  ];
  const result = applyPreset(preset, existingRules);
  assert.ok(result.skippedRuleIds.includes(preset.rules[0].id), 'first rule already exists — should be skipped');
  assert.ok(result.addedRuleIds.includes(preset.rules[1].id), 'second rule is new — should be added');
  assert.strictEqual(result.preset.id, preset.id);
}

// applyPreset with no existing rules adds all
{
  const preset = getPresetById('resource-watchdog')!;
  const result = applyPreset(preset, []);
  assert.strictEqual(result.addedRuleIds.length, preset.rules.length);
  assert.strictEqual(result.skippedRuleIds.length, 0);
}

// buildPresetsFromExisting returns one entry per preset with correct status
{
  const entries = buildPresetsFromExisting(new Set());
  assert.strictEqual(entries.length, ALERT_PRESETS.length);
  for (const { status } of entries) {
    assert.strictEqual(status, 'available');
  }
}

// getPresetChannels returns unique sorted channels from all rules
{
  const preset = getPresetById('security-hardening')!;
  const channels = getPresetChannels(preset);
  assert.ok(Array.isArray(channels));
  assert.ok(channels.length > 0);
  const unique = new Set(channels);
  assert.strictEqual(unique.size, channels.length, 'channels must be deduplicated');
  const sorted = [...channels].sort();
  assert.deepEqual(channels, sorted, 'channels must be sorted');
}

// countPresetsByCategory sums correctly
{
  const entries = buildPresetsFromExisting(new Set());
  const counts = countPresetsByCategory(entries);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  assert.strictEqual(total, ALERT_PRESETS.length, 'category counts must sum to total preset count');
  assert.ok(counts.security >= 1);
  assert.ok(counts.performance >= 1);
  assert.ok(counts.reliability >= 1);
  assert.ok(counts.resource >= 1);
}

console.log('alerting-presets-utils.test.ts: all assertions passed');
