/**
 * lib/storage-registry — central registry of all known localStorage keys.
 *
 * Every key used by the application is registered here via the typed gateway
 * (lib/local-storage). Raw localStorage access is only whitelisted for the
 * inline boot script in layout.tsx (runs pre-module, documented below).
 *
 * Remaining raw-access sites (not yet migrated — follow-up checklist):
 *   - apps/web/src/app/useMaintainerMode.ts                'crashlab:maintainer-mode'
 *   - apps/web/src/app/implement-onboarding-checklist-modal-component.tsx  'crashlab:onboarding-checklist-completed:v1'
 *   - apps/web/src/app/page.tsx                            'crashlab:onboarding-checklist-seen:v1' / -dismissed:v1
 *   - apps/web/src/app/add-reporting-templates-manager.tsx 'crashlab:template-manager:v1'
 *   - apps/web/src/app/create-reporting-templates-page-60.tsx  'crashlab:reporting-templates:v1' / -selected:v1
 *   - apps/web/src/app/add-a-fuzzy-query-builder-page-51.tsx   'crashlab-saved-queries'
 *   - apps/web/src/app/implement-widget-layout-editor-component.tsx  'dashboard-widget-layout'
 *   - apps/web/src/app/implement-run-workflow-board-page-58.tsx  'crashlab-run-workflow-states'
 *
 * WHITELISTED raw access (intentional, documented):
 *   - public/theme-script.js (inline boot script in <head>, runs before any
 *     module is parsed — cannot import this gateway).
 */

import { defineJsonStorage, defineStringStorage } from './local-storage';

// ── Theme persistence (exemplar 1) ────────────────────────────────────────────
// Key matches THEME_STORAGE_KEY in theme-provider-utils.ts
export const themeStore = defineStringStorage('crashlab:theme');

// ── Column visibility / order (exemplar 2) ────────────────────────────────────
export const columnSettingsStore = defineJsonStorage<string[]>(
  'crashlab:column-settings:v1',
);

// ── Triage column order (exemplar 3) ─────────────────────────────────────────
export const triageColumnOrderStore = defineJsonStorage<string[]>(
  'crashlab:triage-column-order:v1',
);
