/**
 * Bundle migration framework (#1426).
 *
 * v1 ships with the registry already in place and one real migrator (v0 → v1),
 * so the forward path is proven by a fixture rather than promised. Adding v2
 * means adding one entry here; nothing else moves.
 */

import { CURRENT_BUNDLE_VERSION } from './bundle-schema';

export type BundleMigrator = (input: Record<string, unknown>) => Record<string, unknown>;

/**
 * v0 was a flat document — the three domains sat at the top level with no
 * `sections` wrapper. v1 nests them so future sections can be added without
 * colliding with metadata keys.
 */
export function migrateV0ToV1(input: Record<string, unknown>): Record<string, unknown> {
  return {
    version: 1,
    sections: {
      alertRules: input.alertRules ?? [],
      channels: input.channels ?? [],
      filterPresets: input.filterPresets ?? [],
    },
  };
}

/** Keyed by the version being migrated *from*. */
export const BUNDLE_MIGRATORS: Readonly<Record<number, BundleMigrator>> = {
  0: migrateV0ToV1,
};

export type MigrationResult =
  | { ok: true; value: Record<string, unknown>; applied: number[] }
  | { ok: false; error: string };

export function readBundleVersion(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const version = (value as Record<string, unknown>).version;
  return typeof version === 'number' && Number.isInteger(version) ? version : null;
}

/**
 * Steps a document up to the current version, one migrator at a time.
 * Structural validation still happens afterwards — migration only reshapes.
 */
export function migrateBundle(value: unknown): MigrationResult {
  const version = readBundleVersion(value);
  if (version === null) {
    return { ok: false, error: 'Bundle is missing an integer `version` field.' };
  }
  if (version > CURRENT_BUNDLE_VERSION) {
    return {
      ok: false,
      error: `Bundle version ${version} is newer than this build supports (${CURRENT_BUNDLE_VERSION}). Upgrade CrashLab first.`,
    };
  }

  let current = value as Record<string, unknown>;
  let currentVersion = version;
  const applied: number[] = [];

  while (currentVersion < CURRENT_BUNDLE_VERSION) {
    const migrator = BUNDLE_MIGRATORS[currentVersion];
    if (!migrator) {
      return { ok: false, error: `No migrator registered for bundle version ${currentVersion}.` };
    }
    current = migrator(current);
    applied.push(currentVersion);
    const next = readBundleVersion(current);
    if (next === null || next <= currentVersion) {
      return {
        ok: false,
        error: `Migrator for version ${currentVersion} did not advance the version field.`,
      };
    }
    currentVersion = next;
  }

  return { ok: true, value: current, applied };
}
