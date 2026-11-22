/**
 * lib/storage-registry — central registry of all known localStorage keys.
 *
 * Every key used by the application is accessed through the guarded gateway
 * (lib/local-storage). Typed entries live here; exact-key consumers use the
 * safeStorage helpers so legacy key names remain unchanged. Raw browser storage
 * is intentionally limited to the pre-module theme boot script in layout.tsx
 * (documented below), which cannot import a module before the first paint.
 */

import { defineJsonStorage, defineStringStorage } from './local-storage';

// ── Theme persistence (exemplar 1) ────────────────────────────────────────────
// Key matches THEME_STORAGE_KEY in theme-provider-utils.ts
export const themeStore = defineStringStorage('crashlab:theme');

// ── Accessibility preferences (#1668) ────────────────────────────────────────
export interface AccessibilityPrefs {
  motion: 'system' | 'reduced' | 'full';
  textScale: 100 | 112 | 125 | 150;
  contrast: 'standard' | 'high';
}

export const accessibilityPrefsStore = defineJsonStorage<AccessibilityPrefs>(
  'crashlab:accessibility-prefs:v1',
);

// ── Triage swimlane layout (#1667) ───────────────────────────────────────────
export interface TriageSwimlaneStored {
  groupBy: 'status' | 'severity' | 'area';
  order: string[];
  collapsed: Record<string, boolean>;
}

export const triageSwimlaneStore = defineJsonStorage<TriageSwimlaneStored>(
  'crashlab:triage-swimlane:v1',
);

// ── Column visibility / order (exemplar 2) ────────────────────────────────────
export const columnSettingsStore = defineJsonStorage<string[]>(
  'crashlab:column-settings:v1',
);

// ── Triage column order (exemplar 3) ─────────────────────────────────────────
export const triageColumnOrderStore = defineJsonStorage<string[]>(
  'crashlab:triage-column-order:v1',
);
