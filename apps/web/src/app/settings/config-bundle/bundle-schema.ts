/**
 * Project configuration bundle: schema and canonical serialization (#1426).
 *
 * A bundle carries the three domains that drift between environments — alert
 * rules, notification channel prefs, and saved filter presets — behind a
 * version field so older files can be migrated forward rather than rejected.
 *
 * Validation follows the settings-import pattern (parse, report every problem,
 * commit nothing until the whole document is good). This module owns the
 * campaign-config domains; app settings import stays where it is.
 */

import { z } from 'zod';

export const CURRENT_BUNDLE_VERSION = 1;

const alertRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string(),
  category: z.enum(['performance', 'reliability', 'security', 'resource']),
  enabled: z.boolean(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  condition: z.enum(['threshold', 'trend', 'anomaly', 'consecutive']),
  threshold: z.number(),
  unit: z.string(),
  channels: z.array(z.enum(['email', 'slack', 'webhook', 'sms'])),
  cooldown: z.number(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  lastTriggered: z.string().optional(),
});

const channelSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['email', 'slack', 'webhook', 'sms']),
  name: z.string(),
  enabled: z.boolean(),
  config: z.record(z.union([z.string(), z.array(z.string()), z.number(), z.boolean()])),
});

const filterPresetSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string(),
  filters: z.record(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const bundleSectionSchemas = {
  alertRules: z.array(alertRuleSchema),
  channels: z.array(channelSchema),
  filterPresets: z.array(filterPresetSchema),
} as const;

export const configBundleSchema = z.object({
  version: z.literal(CURRENT_BUNDLE_VERSION),
  sections: z.object(bundleSectionSchemas),
});

export type ConfigBundle = z.infer<typeof configBundleSchema>;
export type BundleSectionName = keyof typeof bundleSectionSchemas;

export const BUNDLE_SECTIONS: readonly BundleSectionName[] = [
  'alertRules',
  'channels',
  'filterPresets',
];

export const SECTION_LABEL: Record<BundleSectionName, string> = {
  alertRules: 'Alert rules',
  channels: 'Channel preferences',
  filterPresets: 'Filter presets',
};

export interface BundleValidationIssue {
  section: BundleSectionName | 'bundle';
  path: string;
  message: string;
}

export type BundleValidation =
  | { ok: true; bundle: ConfigBundle }
  | { ok: false; issues: BundleValidationIssue[] };

/**
 * Validates a whole bundle, reporting every problem at once. Nothing is
 * partially accepted: a single bad rule fails the document.
 */
export function validateBundle(value: unknown): BundleValidation {
  const result = configBundleSchema.safeParse(value);
  if (result.success) return { ok: true, bundle: result.data };

  const issues: BundleValidationIssue[] = result.error.issues.map((issue) => {
    const [root, sectionName] = issue.path;
    const section =
      root === 'sections' && typeof sectionName === 'string' && sectionName in bundleSectionSchemas
        ? (sectionName as BundleSectionName)
        : 'bundle';
    return { section, path: issue.path.join('.') || '(root)', message: issue.message };
  });

  return { ok: false, issues };
}

// ── Canonical serialization ──────────────────────────────────────────────────
//
// Round-trip identity is only testable if two exports of the same content
// produce the same bytes, so keys are emitted in sorted order and each
// section's items are ordered by id. Nothing else about the data changes.

export function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeValue);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] === undefined) continue;
      sorted[key] = canonicalizeValue(source[key]);
    }
    return sorted;
  }
  return value;
}

function sortById<T extends { id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function canonicalizeBundle(bundle: ConfigBundle): ConfigBundle {
  return canonicalizeValue({
    version: bundle.version,
    sections: {
      alertRules: sortById(bundle.sections.alertRules),
      channels: sortById(bundle.sections.channels),
      filterPresets: sortById(bundle.sections.filterPresets),
    },
  }) as ConfigBundle;
}

export function serializeBundle(bundle: ConfigBundle): string {
  return `${JSON.stringify(canonicalizeBundle(bundle), null, 2)}\n`;
}

export function createEmptyBundle(): ConfigBundle {
  return {
    version: CURRENT_BUNDLE_VERSION,
    sections: { alertRules: [], channels: [], filterPresets: [] },
  };
}
