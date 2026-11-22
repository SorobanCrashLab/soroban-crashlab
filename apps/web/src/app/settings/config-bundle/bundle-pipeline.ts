/**
 * The import pipeline: validate → migrate → preview → commit (#1426).
 *
 * Nothing is written until the whole document has parsed, migrated, and been
 * previewed, so a corrupt section rejects the file wholesale rather than
 * leaving storage half-updated.
 */

import { recordAuditEvent } from '../../../lib/audit/audit-sink';
import { diffBundle, type BundleDiff } from './bundle-diff';
import type { ConfigBundleGateway } from './bundle-gateway';
import { migrateBundle } from './bundle-migrations';
import {
  serializeBundle,
  validateBundle,
  type ConfigBundle,
} from './bundle-schema';

export type ImportPreparation =
  | { status: 'invalid'; errors: string[] }
  | {
      status: 'ready';
      bundle: ConfigBundle;
      diff: BundleDiff;
      /** Versions whose migrators ran, in order. Empty for a current bundle. */
      migrationsApplied: number[];
    };

export function prepareImport(text: string, current: ConfigBundle): ImportPreparation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { status: 'invalid', errors: ['File is not valid JSON.'] };
  }

  const migrated = migrateBundle(parsed);
  if (!migrated.ok) {
    return { status: 'invalid', errors: [migrated.error] };
  }

  const validation = validateBundle(migrated.value);
  if (!validation.ok) {
    return {
      status: 'invalid',
      errors: validation.issues.map((issue) => `${issue.path}: ${issue.message}`),
    };
  }

  return {
    status: 'ready',
    bundle: validation.bundle,
    diff: diffBundle(current, validation.bundle),
    migrationsApplied: migrated.applied,
  };
}

export type CommitResult = { ok: true } | { ok: false; error: string };

/**
 * Re-validates before writing — the preview may have been sitting on screen
 * while something else changed — then hands the whole bundle to the gateway.
 */
export function commitImport(gateway: ConfigBundleGateway, bundle: ConfigBundle): CommitResult {
  const validation = validateBundle(bundle);
  if (!validation.ok) {
    return { ok: false, error: 'Bundle failed validation on commit; nothing was changed.' };
  }

  try {
    gateway.write(validation.bundle);
    recordAuditEvent({
      action: 'config.bundle.import',
      target: `bundle v${validation.bundle.version}`,
      metadata: {
        alertRules: validation.bundle.sections.alertRules.length,
        channels: validation.bundle.sections.channels.length,
        filterPresets: validation.bundle.sections.filterPresets.length,
      },
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Import failed; nothing was changed.',
    };
  }
}

export function exportBundle(gateway: ConfigBundleGateway): string {
  return serializeBundle(gateway.read());
}
