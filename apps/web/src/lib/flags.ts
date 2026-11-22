import { safeStorage } from "./local-storage";

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

function getUrlOverride(flag: FlagKey): boolean | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const val = params.get(`flag:${flag}`);
  if (val === 'true') return true;
  if (val === 'false') return false;
  return null;
}

function getLocalStorageOverride(flag: FlagKey): boolean | null {
  if (typeof window === 'undefined') return null;
  try {
    const val = safeStorage.getItem(STORAGE_PREFIX + flag);
    if (val === 'true') return true;
    if (val === 'false') return false;
  } catch {
    // localStorage may be unavailable
  }
  return null;
}

export function isEnabled(flag: FlagKey): boolean {
  const urlOverride = getUrlOverride(flag);
  if (urlOverride !== null) return urlOverride;

  const lsOverride = getLocalStorageOverride(flag);
  if (lsOverride !== null) return lsOverride;

  return !FLAGS[flag].defaultOff;
}

export function setFlag(flag: FlagKey, value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    safeStorage.setItem(STORAGE_PREFIX + flag, String(value));
  } catch {
    // localStorage may be unavailable
  }
}

export function clearFlag(flag: FlagKey): void {
  if (typeof window === 'undefined') return;
  try {
    safeStorage.removeItem(STORAGE_PREFIX + flag);
  } catch {
    // localStorage may be unavailable
  }
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
