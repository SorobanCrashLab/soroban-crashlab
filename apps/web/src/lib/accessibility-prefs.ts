/**
 * lib/accessibility-prefs — single source of truth for a11y overrides (#1668).
 * Persisted via storage-registry.accessibilityPrefsStore; applied pre-paint by
 * the bootstrap script in layout.tsx / public/theme-script.js to avoid
 * flash-of-wrong-preference (same mechanism as the theme bootstrap).
 */

export type MotionPref = 'system' | 'reduced' | 'full';
export type TextScale = 100 | 112 | 125 | 150;
export type ContrastPref = 'standard' | 'high';

export interface AccessibilityPrefs {
  motion: MotionPref;
  textScale: TextScale;
  contrast: ContrastPref;
}

export const DEFAULT_ACCESSIBILITY_PREFS: AccessibilityPrefs = {
  motion: 'system',
  textScale: 100,
  contrast: 'standard',
};

export function parseAccessibilityPrefs(raw: unknown): AccessibilityPrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_ACCESSIBILITY_PREFS };
  const r = raw as Partial<AccessibilityPrefs>;
  const motion: MotionPref = r.motion === 'reduced' || r.motion === 'full' ? r.motion : 'system';
  const textScale: TextScale = r.textScale === 112 || r.textScale === 125 || r.textScale === 150 ? r.textScale : 100;
  const contrast: ContrastPref = r.contrast === 'high' ? 'high' : 'standard';
  return { motion, textScale, contrast };
}

/** Pure DOM applicator shared by the bootstrap script and the provider. */
export function applyAccessibilityPrefsToDocument(prefs: AccessibilityPrefs, doc: Document): void {
  const el = doc.documentElement;
  const osReduced =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reduced = prefs.motion === 'reduced' || (prefs.motion === 'system' && osReduced);
  if (reduced) el.setAttribute('data-motion', 'reduced');
  else el.removeAttribute('data-motion');
  el.setAttribute('data-text-scale', String(prefs.textScale));
  el.style.fontSize = `${(16 * prefs.textScale) / 100}px`;
  el.classList.toggle('high-contrast', prefs.contrast === 'high');
}
