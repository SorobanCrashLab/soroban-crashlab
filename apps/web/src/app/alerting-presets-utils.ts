import type { AlertRule, AlertCategory, AlertSeverity, AlertChannel } from './alerting-settings-page-utils';

export type PresetId =
  | 'security-hardening'
  | 'performance-monitoring'
  | 'reliability-guard'
  | 'resource-watchdog';

export type PresetStatus = 'available' | 'applied' | 'partial';

export interface AlertPreset {
  id: PresetId;
  name: string;
  description: string;
  category: AlertCategory;
  ruleCount: number;
  severity: AlertSeverity;
  rules: Omit<AlertRule, 'createdAt' | 'lastTriggered'>[];
}

export interface PresetApplicationResult {
  preset: AlertPreset;
  addedRuleIds: string[];
  skippedRuleIds: string[];
}

const PRESET_RULES: Record<PresetId, Omit<AlertRule, 'createdAt' | 'lastTriggered'>[]> = {
  'security-hardening': [
    {
      id: 'preset-sec-violation',
      name: 'Security Violation Detected',
      description: 'Alert on any security vulnerability discovery.',
      category: 'security',
      enabled: true,
      severity: 'critical',
      condition: 'threshold',
      threshold: 1,
      unit: 'violation',
      channels: ['email', 'slack', 'sms'],
      cooldown: 5,
      tags: ['security', 'preset'],
    },
    {
      id: 'preset-sec-auth-failure',
      name: 'Auth Failure Spike',
      description: 'Alert when authentication failures exceed threshold in a fuzzing run.',
      category: 'security',
      enabled: true,
      severity: 'high',
      condition: 'threshold',
      threshold: 10,
      unit: 'failures',
      channels: ['email', 'slack'],
      cooldown: 15,
      tags: ['security', 'auth', 'preset'],
    },
  ],
  'performance-monitoring': [
    {
      id: 'preset-perf-memory-anomaly',
      name: 'Memory Usage Anomaly',
      description: 'Alert when memory usage deviates significantly from baseline.',
      category: 'performance',
      enabled: true,
      severity: 'medium',
      condition: 'anomaly',
      threshold: 2.5,
      unit: 'std dev',
      channels: ['webhook'],
      cooldown: 120,
      tags: ['performance', 'memory', 'preset'],
    },
    {
      id: 'preset-perf-cpu-trend',
      name: 'CPU Instruction Trend',
      description: 'Alert when CPU instruction count trends upward over multiple runs.',
      category: 'performance',
      enabled: true,
      severity: 'medium',
      condition: 'trend',
      threshold: 20,
      unit: '%',
      channels: ['email'],
      cooldown: 60,
      tags: ['performance', 'cpu', 'preset'],
    },
  ],
  'reliability-guard': [
    {
      id: 'preset-rel-crash-spike',
      name: 'Crash Rate Spike',
      description: 'Alert when crash rate increases significantly over a short window.',
      category: 'reliability',
      enabled: true,
      severity: 'high',
      condition: 'threshold',
      threshold: 15,
      unit: '%',
      channels: ['email', 'slack'],
      cooldown: 30,
      tags: ['reliability', 'crashes', 'preset'],
    },
    {
      id: 'preset-rel-consecutive-failures',
      name: 'Consecutive Failures',
      description: 'Alert when multiple consecutive fuzzing runs fail.',
      category: 'reliability',
      enabled: true,
      severity: 'critical',
      condition: 'consecutive',
      threshold: 3,
      unit: 'failures',
      channels: ['email', 'slack', 'sms'],
      cooldown: 15,
      tags: ['reliability', 'preset'],
    },
  ],
  'resource-watchdog': [
    {
      id: 'preset-res-exhaustion',
      name: 'Resource Exhaustion',
      description: 'Alert when runs consistently hit CPU or memory limits.',
      category: 'resource',
      enabled: true,
      severity: 'medium',
      condition: 'consecutive',
      threshold: 5,
      unit: 'runs',
      channels: ['email'],
      cooldown: 60,
      tags: ['resource', 'preset'],
    },
    {
      id: 'preset-res-fee-spike',
      name: 'Resource Fee Spike',
      description: 'Alert when minimum resource fees spike beyond expected range.',
      category: 'resource',
      enabled: true,
      severity: 'low',
      condition: 'threshold',
      threshold: 50,
      unit: '%',
      channels: ['email', 'webhook'],
      cooldown: 90,
      tags: ['resource', 'fees', 'preset'],
    },
  ],
};

export const ALERT_PRESETS: AlertPreset[] = [
  {
    id: 'security-hardening',
    name: 'Security Hardening',
    description:
      'Critical alerts for security violations and authentication failures. Recommended for production environments.',
    category: 'security',
    severity: 'critical',
    ruleCount: PRESET_RULES['security-hardening'].length,
    rules: PRESET_RULES['security-hardening'],
  },
  {
    id: 'performance-monitoring',
    name: 'Performance Monitoring',
    description:
      'Track memory anomalies and CPU instruction trends across fuzzing runs.',
    category: 'performance',
    severity: 'medium',
    ruleCount: PRESET_RULES['performance-monitoring'].length,
    rules: PRESET_RULES['performance-monitoring'],
  },
  {
    id: 'reliability-guard',
    name: 'Reliability Guard',
    description:
      'Catch crash spikes and consecutive failure patterns before they compound.',
    category: 'reliability',
    severity: 'high',
    ruleCount: PRESET_RULES['reliability-guard'].length,
    rules: PRESET_RULES['reliability-guard'],
  },
  {
    id: 'resource-watchdog',
    name: 'Resource Watchdog',
    description:
      'Monitor resource exhaustion and fee spikes to keep fuzzing costs predictable.',
    category: 'resource',
    severity: 'medium',
    ruleCount: PRESET_RULES['resource-watchdog'].length,
    rules: PRESET_RULES['resource-watchdog'],
  },
];

export function getPresetById(id: PresetId): AlertPreset | undefined {
  return ALERT_PRESETS.find((p) => p.id === id);
}

export function getPresetStatus(
  preset: AlertPreset,
  existingRuleIds: Set<string>,
): PresetStatus {
  const matched = preset.rules.filter((r) => existingRuleIds.has(r.id)).length;
  if (matched === 0) return 'available';
  if (matched === preset.rules.length) return 'applied';
  return 'partial';
}

export function applyPreset(
  preset: AlertPreset,
  existingRules: AlertRule[],
  referenceTime = new Date(),
): PresetApplicationResult {
  const existingIds = new Set(existingRules.map((r) => r.id));
  const addedRuleIds: string[] = [];
  const skippedRuleIds: string[] = [];

  for (const rule of preset.rules) {
    if (existingIds.has(rule.id)) {
      skippedRuleIds.push(rule.id);
    } else {
      addedRuleIds.push(rule.id);
    }
  }

  return { preset, addedRuleIds, skippedRuleIds };
}

export function buildPresetsFromExisting(
  existingRuleIds: Set<string>,
): Array<{ preset: AlertPreset; status: PresetStatus }> {
  return ALERT_PRESETS.map((preset) => ({
    preset,
    status: getPresetStatus(preset, existingRuleIds),
  }));
}

export function getPresetChannels(preset: AlertPreset): AlertChannel[] {
  const seen = new Set<AlertChannel>();
  for (const rule of preset.rules) {
    for (const ch of rule.channels) {
      seen.add(ch);
    }
  }
  return Array.from(seen).sort();
}

export function countPresetsByCategory(
  entries: Array<{ preset: AlertPreset; status: PresetStatus }>,
): Record<AlertCategory, number> {
  const counts: Record<AlertCategory, number> = {
    performance: 0,
    reliability: 0,
    security: 0,
    resource: 0,
  };
  for (const { preset } of entries) {
    counts[preset.category] += 1;
  }
  return counts;
}
