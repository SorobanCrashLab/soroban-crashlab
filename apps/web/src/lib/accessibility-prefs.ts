/**
 * lib/accessibility-prefs — single source of truth for a11y overrides (#1668, #2317).
 * Persisted via storage-registry.accessibilityPrefsStore; applied pre-paint by
 * the bootstrap script in layout.tsx / public/theme-script.js to avoid
 * flash-of-wrong-preference (same mechanism as the theme bootstrap).
 */

export type MotionPref = 'system' | 'reduced' | 'full';
export type TextScale = 100 | 112 | 125 | 150;
export type ContrastPref = 'standard' | 'high';
export type LineHeightPref = 'normal' | 'relaxed' | 'spacious';
export type DensityPref = 'compact' | 'comfortable' | 'spacious';
export type FocusIndicatorPref = 'default' | 'enhanced' | 'high-visibility';
export type PointerTargetPref = 'standard' | 'large';
export type KeyboardNavigationPref = 'standard' | 'enhanced-shortcuts' | 'roving-grid';

/** Per-surface assistive alternatives for complex visualizations & dense views (#2317). */
export interface AssistiveModePrefs {
  chartDataTableAlternative: boolean;
  autoSummaryDescriptions: boolean;
  patternShapeEncoding: boolean;
  simplifiedDenseLayout: boolean;
}

export interface AccessibilityPrefs {
  motion: MotionPref;
  textScale: TextScale;
  contrast: ContrastPref;
  lineHeight?: LineHeightPref;
  density?: DensityPref;
  focusIndicator?: FocusIndicatorPref;
  pointerTarget?: PointerTargetPref;
  keyboardNavigation?: KeyboardNavigationPref;
  assistiveModes?: AssistiveModePrefs;
  syncConsent?: boolean;
  workspaceScope?: string;
}

export const DEFAULT_ASSISTIVE_MODE_PREFS: AssistiveModePrefs = {
  chartDataTableAlternative: false,
  autoSummaryDescriptions: true,
  patternShapeEncoding: false,
  simplifiedDenseLayout: false,
};

export const DEFAULT_ACCESSIBILITY_PREFS: AccessibilityPrefs = {
  motion: 'system',
  textScale: 100,
  contrast: 'standard',
};

const LINE_HEIGHT_MAP: Record<LineHeightPref, string> = {
  normal: '1.5',
  relaxed: '1.75',
  spacious: '2',
};

export function parseAssistiveModePrefs(raw: unknown): AssistiveModePrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_ASSISTIVE_MODE_PREFS };
  const r = raw as Partial<AssistiveModePrefs>;
  return {
    chartDataTableAlternative: Boolean(r.chartDataTableAlternative),
    autoSummaryDescriptions:
      typeof r.autoSummaryDescriptions === 'boolean'
        ? r.autoSummaryDescriptions
        : DEFAULT_ASSISTIVE_MODE_PREFS.autoSummaryDescriptions,
    patternShapeEncoding: Boolean(r.patternShapeEncoding),
    simplifiedDenseLayout: Boolean(r.simplifiedDenseLayout),
  };
}

export function parseAccessibilityPrefs(raw: unknown): AccessibilityPrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_ACCESSIBILITY_PREFS };
  const r = raw as Partial<AccessibilityPrefs>;
  const motion: MotionPref = r.motion === 'reduced' || r.motion === 'full' ? r.motion : 'system';
  const textScale: TextScale = r.textScale === 112 || r.textScale === 125 || r.textScale === 150 ? r.textScale : 100;
  const contrast: ContrastPref = r.contrast === 'high' ? 'high' : 'standard';

  const result: AccessibilityPrefs = { motion, textScale, contrast };

  if (r.lineHeight === 'normal' || r.lineHeight === 'relaxed' || r.lineHeight === 'spacious') {
    result.lineHeight = r.lineHeight;
  }
  if (r.density === 'compact' || r.density === 'comfortable' || r.density === 'spacious') {
    result.density = r.density;
  }
  if (
    r.focusIndicator === 'default' ||
    r.focusIndicator === 'enhanced' ||
    r.focusIndicator === 'high-visibility'
  ) {
    result.focusIndicator = r.focusIndicator;
  }
  if (r.pointerTarget === 'standard' || r.pointerTarget === 'large') {
    result.pointerTarget = r.pointerTarget;
  }
  if (
    r.keyboardNavigation === 'standard' ||
    r.keyboardNavigation === 'enhanced-shortcuts' ||
    r.keyboardNavigation === 'roving-grid'
  ) {
    result.keyboardNavigation = r.keyboardNavigation;
  }
  if (r.assistiveModes && typeof r.assistiveModes === 'object') {
    result.assistiveModes = parseAssistiveModePrefs(r.assistiveModes);
  }
  if (typeof r.syncConsent === 'boolean') {
    result.syncConsent = r.syncConsent;
  }
  if (typeof r.workspaceScope === 'string' && r.workspaceScope.trim().length > 0) {
    result.workspaceScope = r.workspaceScope.trim().slice(0, 64);
  }

  return result;
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

  const lineHeight = prefs.lineHeight ?? 'normal';
  el.setAttribute('data-line-height', lineHeight);
  el.style.lineHeight = LINE_HEIGHT_MAP[lineHeight];

  const density = prefs.density ?? 'comfortable';
  el.setAttribute('data-density', density);

  const focusIndicator = prefs.focusIndicator ?? 'default';
  el.setAttribute('data-focus-indicator', focusIndicator);

  const pointerTarget = prefs.pointerTarget ?? 'standard';
  el.setAttribute('data-pointer-target', pointerTarget);

  const keyboardNav = prefs.keyboardNavigation ?? 'standard';
  el.setAttribute('data-keyboard-nav', keyboardNav);

  const modes = prefs.assistiveModes ?? DEFAULT_ASSISTIVE_MODE_PREFS;
  el.setAttribute('data-assistive-table-alt', String(modes.chartDataTableAlternative));
  el.setAttribute('data-assistive-patterns', String(modes.patternShapeEncoding));
  el.setAttribute('data-assistive-simplified', String(modes.simplifiedDenseLayout));
}

