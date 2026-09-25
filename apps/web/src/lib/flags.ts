import { safeStorageGet, safeStorageRemove, safeStorageSet } from './local-storage';

export interface FeatureFlag {
  name: string;
  description: string;
  defaultOff: boolean;
}

export const FLAGS = {
  dashboardV2: {
    name: 'dashboardV2',
    description: 'Enable the redesigned dashboard layout',
    defaultOff: true,
  },
  advancedFilters: {
    name: 'advancedFilters',
    description: 'Enable advanced filter controls on the triage board',
    defaultOff: true,
  },
} as const satisfies Record<string, FeatureFlag>;

export type FlagKey = keyof typeof FLAGS;

const STORAGE_PREFIX = 'crashlab:flag:';

function parseBoolean(val: string | null): boolean | null {
  if (val === 'true') return true;
  if (val === 'false') return false;
  return null;
}

function getUrlOverride(flag: FlagKey): boolean | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseBoolean(new URLSearchParams(window.location.search).get(`flag:${flag}`));
  } catch {
    return null;
  }
}

function getLocalStorageOverride(flag: FlagKey): boolean | null {
  // Blocked/throwing storage falls back to the flag default.
  return parseBoolean(safeStorageGet('localStorage', STORAGE_PREFIX + flag));
}

export function isEnabled(flag: FlagKey): boolean {
  const urlOverride = getUrlOverride(flag);
  if (urlOverride !== null) return urlOverride;

  const lsOverride = getLocalStorageOverride(flag);
  if (lsOverride !== null) return lsOverride;

  return !FLAGS[flag].defaultOff;
}

export function setFlag(flag: FlagKey, value: boolean): void {
  safeStorageSet('localStorage', STORAGE_PREFIX + flag, String(value));
}

export function clearFlag(flag: FlagKey): void {
  safeStorageRemove('localStorage', STORAGE_PREFIX + flag);
}

export function getEnabledFlags(): FlagKey[] {
  return (Object.keys(FLAGS) as FlagKey[]).filter((f) => isEnabled(f));
}

if (typeof window !== 'undefined') {
  const enabled = getEnabledFlags();
  if (enabled.length > 0) {
    console.debug('[flags] Enabled features:', enabled.join(', '));
  }
}
