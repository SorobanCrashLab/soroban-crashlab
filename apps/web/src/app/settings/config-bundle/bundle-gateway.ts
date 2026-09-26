/**
 * Reads and writes the domains a configuration bundle covers (#1426).
 *
 * The bundle spans two storage keys, so `write` snapshots both before touching
 * either and restores them if any write throws. That is what makes an import
 * all-or-nothing: a bundle can never be half-applied.
 */

import {
  ALERTING_SETTINGS_STORAGE_KEY,
  createDefaultAlertingSettingsSnapshot,
  readAlertingSettingsSnapshot,
  type AlertingSettingsSnapshot,
} from '../../alerting-settings-page-utils';
import { PRESETS_STORAGE_KEY } from '../../saved-filter-presets-utils';
import { createEmptyBundle, type ConfigBundle } from './bundle-schema';
import { safeStorage } from "../../../lib/local-storage";

export interface ConfigBundleGateway {
  read(): ConfigBundle;
  /** Applies every section or none. Throws if the write could not complete. */
  write(bundle: ConfigBundle): void;
}

export function createLocalConfigBundleGateway(): ConfigBundleGateway {
  return {
    read() {
      if (typeof window === 'undefined') return createEmptyBundle();

      const alerting = readAlertingSettingsSnapshot(
        safeStorage.getItem(ALERTING_SETTINGS_STORAGE_KEY),
      );
      const snapshot: AlertingSettingsSnapshot =
        alerting.snapshot ?? createDefaultAlertingSettingsSnapshot();

      let filterPresets: ConfigBundle['sections']['filterPresets'] = [];
      try {
        const raw = safeStorage.getItem(PRESETS_STORAGE_KEY);
        filterPresets = raw ? JSON.parse(raw) : [];
      } catch {
        filterPresets = [];
      }

      return {
        version: 1,
        sections: {
          alertRules: snapshot.alertRules,
          channels: snapshot.channels,
          filterPresets,
        },
      };
    },

    write(bundle) {
      if (typeof window === 'undefined') {
        throw new Error('Configuration bundles can only be imported in the browser');
      }

      const previousAlerting = safeStorage.getItem(ALERTING_SETTINGS_STORAGE_KEY);
      const previousPresets = safeStorage.getItem(PRESETS_STORAGE_KEY);

      try {
        const existing = readAlertingSettingsSnapshot(previousAlerting);
        const base = existing.snapshot ?? createDefaultAlertingSettingsSnapshot();
        // History is local telemetry, not configuration, so an import leaves it
        // alone rather than importing another environment's alert history.
        const merged: AlertingSettingsSnapshot = {
          ...base,
          alertRules: bundle.sections.alertRules,
          channels: bundle.sections.channels,
          lastUpdated: new Date().toISOString(),
        };

        safeStorage.setItem(ALERTING_SETTINGS_STORAGE_KEY, JSON.stringify(merged));
        safeStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(bundle.sections.filterPresets));
      } catch (error) {
        restore(ALERTING_SETTINGS_STORAGE_KEY, previousAlerting);
        restore(PRESETS_STORAGE_KEY, previousPresets);
        throw error;
      }
    },
  };
}

function restore(key: string, value: string | null): void {
  try {
    if (value === null) safeStorage.removeItem(key);
    else safeStorage.setItem(key, value);
  } catch {
    // Nothing further to do — the caller is already surfacing the failure.
  }
}
