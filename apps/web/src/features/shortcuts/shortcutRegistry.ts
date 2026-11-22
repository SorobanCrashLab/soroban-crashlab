/**
 * shortcutRegistry — central command & keyboard shortcut registry with
 * context scopes (`global`, `page`, `component`, `modal`), surface tags
 * (`run_workspace`, `diff`, `trace`, `logs`, `tables`, `canvas`), precedence
 * rules, chord normalization, and audit-safe privileged action flags (#2315).
 */

export type ShortcutScope = 'modal' | 'component' | 'page' | 'global';

export type ShortcutSurface =
  | 'global_shell'
  | 'run_workspace'
  | 'diff'
  | 'trace'
  | 'logs'
  | 'tables'
  | 'canvas';

export interface ShortcutCommandDefinition {
  id: string;
  title: string;
  description: string;
  scope: ShortcutScope;
  surface: ShortcutSurface;
  defaultBinding: string;
  /** Non-keyboard UI alternative path/control so accessibility never depends on shortcuts alone. */
  nonKeyboardAlternative: string;
  /**
   * Privileged or destructive actions require confirmation (no silent destructive
   * execution via a single accidental key press).
   */
  privileged?: boolean;
  requiresConfirmation?: boolean;
}

/**
 * Scope precedence weights: more specific scopes (`modal > component > page > global`)
 * take priority when resolving active key events.
 */
export const SCOPE_PRECEDENCE_RANK: Record<ShortcutScope, number> = {
  modal: 4,
  component: 3,
  page: 2,
  global: 1,
};

const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const;

const MODIFIER_ALIASES: Record<string, (typeof MODIFIER_ORDER)[number]> = {
  ctrl: 'Ctrl',
  control: 'Ctrl',
  cmd: 'Meta',
  command: 'Meta',
  meta: 'Meta',
  win: 'Meta',
  super: 'Meta',
  alt: 'Alt',
  option: 'Alt',
  opt: 'Alt',
  shift: 'Shift',
};

const KEY_ALIASES: Record<string, string> = {
  esc: 'Escape',
  escape: 'Escape',
  return: 'Enter',
  enter: 'Enter',
  space: 'Space',
  ' ': 'Space',
  up: 'ArrowUp',
  arrowup: 'ArrowUp',
  down: 'ArrowDown',
  arrowdown: 'ArrowDown',
  left: 'ArrowLeft',
  arrowleft: 'ArrowLeft',
  right: 'ArrowRight',
  arrowright: 'ArrowRight',
  del: 'Delete',
  delete: 'Delete',
  backspace: 'Backspace',
  tab: 'Tab',
  slash: '/',
  question: '?',
};

/**
 * Normalizes a single key combination (e.g. `"shift + ctrl + k"` -> `"Ctrl+Shift+K"`)
 * or a multi-step chord (e.g. `"g r"` -> `"G then R"`).
 */
export function normalizeKeyCombo(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // Support two-step sequential chords separated by "then" or whitespace (when no "+" is used)
  if (/\s+then\s+/i.test(trimmed) || (!trimmed.includes('+') && /\s+/.test(trimmed))) {
    const steps = trimmed
      .split(/\s+then\s+|\s+/i)
      .map((s) => normalizeSingleCombo(s))
      .filter(Boolean);
    return steps.join(' then ');
  }

  return normalizeSingleCombo(trimmed);
}

function normalizeSingleCombo(combo: string): string {
  const parts = combo
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);

  const modifiers = new Set<(typeof MODIFIER_ORDER)[number]>();
  let mainKey = '';

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(MODIFIER_ALIASES, lower)) {
      modifiers.add(MODIFIER_ALIASES[lower]);
    } else if (Object.prototype.hasOwnProperty.call(KEY_ALIASES, lower)) {
      mainKey = KEY_ALIASES[lower];
    } else if (part.length === 1) {
      mainKey = part.toUpperCase();
    } else {
      mainKey = part.charAt(0).toUpperCase() + part.slice(1);
    }
  }

  const orderedMods = MODIFIER_ORDER.filter((m) => modifiers.has(m));
  return mainKey ? [...orderedMods, mainKey].join('+') : orderedMods.join('+');
}

/** Localization-aware display formatter (e.g. macOS symbols vs standard labels). */
export function formatShortcutForPlatform(
  binding: string,
  platform: 'mac' | 'standard' = 'standard',
): string {
  const canonical = normalizeKeyCombo(binding);
  if (platform !== 'mac') return canonical;
  return canonical
    .replace(/\bCtrl\+/g, '⌃')
    .replace(/\bAlt\+/g, '⌥')
    .replace(/\bShift\+/g, '⇧')
    .replace(/\bMeta\+/g, '⌘');
}

/** Default canonical shortcut catalog across all CrashLab surfaces (#2315). */
export const DEFAULT_SHORTCUT_CATALOG: readonly ShortcutCommandDefinition[] = [
  // Global Shell
  {
    id: 'global.command_palette',
    title: 'Open Command Palette',
    description: 'Search and launch commands, routes, and recent runs across CrashLab.',
    scope: 'global',
    surface: 'global_shell',
    defaultBinding: 'Ctrl+K',
    nonKeyboardAlternative: 'Top navigation bar → "Command Palette" search button',
  },
  {
    id: 'global.cheatsheet',
    title: 'Open Keyboard Shortcuts Cheat Sheet',
    description: 'Open the searchable keyboard shortcut reference modal.',
    scope: 'global',
    surface: 'global_shell',
    defaultBinding: 'Shift+?',
    nonKeyboardAlternative: 'Bottom-right floating "?" help button or Settings → Shortcuts',
  },
  {
    id: 'global.nav_dashboard',
    title: 'Go to Dashboard',
    description: 'Navigate to the primary fuzzing operations dashboard.',
    scope: 'global',
    surface: 'global_shell',
    defaultBinding: 'G then D',
    nonKeyboardAlternative: 'Primary top navigation → Dashboard link',
  },
  {
    id: 'global.nav_runs',
    title: 'Go to Runs Workspace',
    description: 'Navigate to the fuzzing run history and cluster explorer.',
    scope: 'global',
    surface: 'global_shell',
    defaultBinding: 'G then R',
    nonKeyboardAlternative: 'Primary top navigation → Runs link',
  },
  {
    id: 'global.nav_accessibility',
    title: 'Jump to Accessibility & Assistive Controls',
    description: 'Open motion, contrast, text scale, and assistive diagnostics settings.',
    scope: 'global',
    surface: 'global_shell',
    defaultBinding: 'Alt+Shift+A',
    nonKeyboardAlternative: 'Settings → Accessibility Preferences & Assistive Diagnostics',
  },

  // Run Workspace
  {
    id: 'run.replay_seed',
    title: 'Trigger Deterministic Seed Replay',
    description: 'Queue a deterministic replay for the active run seed (requires confirmation).',
    scope: 'page',
    surface: 'run_workspace',
    defaultBinding: 'Ctrl+Shift+R',
    nonKeyboardAlternative: 'Run Detail header → "Replay Seed" action button',
    privileged: true,
    requiresConfirmation: true,
  },
  {
    id: 'run.delete_selected',
    title: 'Delete Selected Run Artifact',
    description: 'Delete the selected run record (audit-safe confirmation dialog required).',
    scope: 'page',
    surface: 'run_workspace',
    defaultBinding: 'Ctrl+Shift+Backspace',
    nonKeyboardAlternative: 'Run Detail menu → "Delete Run" with confirmation dialog',
    privileged: true,
    requiresConfirmation: true,
  },

  // Diff Viewer
  {
    id: 'diff.next_divergence',
    title: 'Jump to Next State / Trace Divergence',
    description: 'Advance focus to the next modified ledger entry or trace mismatch.',
    scope: 'component',
    surface: 'diff',
    defaultBinding: 'Alt+N',
    nonKeyboardAlternative: 'Diff toolbar → "Next Change" button',
  },
  {
    id: 'diff.toggle_layout',
    title: 'Toggle Side-by-Side / Unified Diff Layout',
    description: 'Switch between split and unified ledger state diff views.',
    scope: 'component',
    surface: 'diff',
    defaultBinding: 'Alt+U',
    nonKeyboardAlternative: 'Diff toolbar → "Side by side / Unified" toggle chips',
  },

  // Trace Inspector
  {
    id: 'trace.expand_call_frame',
    title: 'Expand / Collapse Recursive Call Frame',
    description: 'Toggle expansion of the focused contract-to-contract call frame.',
    scope: 'component',
    surface: 'trace',
    defaultBinding: 'Enter',
    nonKeyboardAlternative: 'Trace row → Expand/collapse disclosure button',
  },
  {
    id: 'trace.copy_event_hash',
    title: 'Copy Canonical Trace Event Digest',
    description: 'Copy the 64-bit FNV-1a event hash for the focused trace step.',
    scope: 'component',
    surface: 'trace',
    defaultBinding: 'Ctrl+Shift+C',
    nonKeyboardAlternative: 'Trace inspector drawer → "Copy Digest" button',
  },

  // Logs Console
  {
    id: 'logs.toggle_autoscroll',
    title: 'Toggle Live Log Autoscroll',
    description: 'Pause or resume tailing live run log streams.',
    scope: 'page',
    surface: 'logs',
    defaultBinding: 'Alt+S',
    nonKeyboardAlternative: 'Log Viewer toolbar → "Autoscroll ON/OFF" chip',
  },
  {
    id: 'logs.focus_search',
    title: 'Focus Log Query Filter',
    description: 'Move focus directly to the log viewer search input.',
    scope: 'page',
    surface: 'logs',
    defaultBinding: '/',
    nonKeyboardAlternative: 'Click or Tab into the "Search logs" input field',
  },

  // Data Tables
  {
    id: 'tables.next_row',
    title: 'Focus Next Table Row',
    description: 'Move roving focus down one row in data grids.',
    scope: 'component',
    surface: 'tables',
    defaultBinding: 'ArrowDown',
    nonKeyboardAlternative: 'Click target table row or use standard Tab navigation',
  },
  {
    id: 'tables.prev_row',
    title: 'Focus Previous Table Row',
    description: 'Move roving focus up one row in data grids.',
    scope: 'component',
    surface: 'tables',
    defaultBinding: 'ArrowUp',
    nonKeyboardAlternative: 'Click target table row or use Shift+Tab navigation',
  },

  // Whiteboard & Graph Canvas
  {
    id: 'canvas.fit_viewport',
    title: 'Fit Investigation Canvas to Viewport',
    description: 'Center and scale all evidence nodes within the visible canvas area.',
    scope: 'component',
    surface: 'canvas',
    defaultBinding: 'Alt+0',
    nonKeyboardAlternative: 'Canvas toolbar → "Fit to View" control button',
  },

  // Modal Dialogs
  {
    id: 'modal.dismiss',
    title: 'Dismiss Active Modal or Drawer',
    description: 'Close the active modal dialog or drawer and restore focus to trigger.',
    scope: 'modal',
    surface: 'global_shell',
    defaultBinding: 'Escape',
    nonKeyboardAlternative: 'Modal header → "Close (✕)" button',
  },
];

export interface EffectiveShortcutBinding extends ShortcutCommandDefinition {
  effectiveBinding: string;
  isCustomized: boolean;
  enabled: boolean;
}

/**
 * Resolves the effective shortcut catalog by merging user/workspace custom
 * bindings and disabled command IDs over the default registry.
 */
export function resolveEffectiveShortcuts(
  customBindings: Record<string, string> = {},
  disabledIds: readonly string[] = [],
  catalog: readonly ShortcutCommandDefinition[] = DEFAULT_SHORTCUT_CATALOG,
): EffectiveShortcutBinding[] {
  const disabledSet = new Set(disabledIds);
  return catalog.map((cmd) => {
    const customRaw = customBindings[cmd.id];
    const normalizedCustom = customRaw ? normalizeKeyCombo(customRaw) : '';
    const effectiveBinding = normalizedCustom || normalizeKeyCombo(cmd.defaultBinding);
    return {
      ...cmd,
      defaultBinding: normalizeKeyCombo(cmd.defaultBinding),
      effectiveBinding,
      isCustomized:
        Boolean(normalizedCustom) &&
        normalizedCustom !== normalizeKeyCombo(cmd.defaultBinding),
      enabled: !disabledSet.has(cmd.id),
    };
  });
}

/**
 * Resolves which command should fire for an incoming normalized key combo
 * given the currently active context scopes and surface.
 * Higher precedence scopes (`modal > component > page > global`) win deterministically.
 */
export function matchShortcutCommandForKey(
  keyCombo: string,
  bindings: readonly EffectiveShortcutBinding[],
  context: {
    activeSurface?: ShortcutSurface;
    modalOpen?: boolean;
  } = {},
): EffectiveShortcutBinding | null {
  const targetCombo = normalizeKeyCombo(keyCombo);
  if (!targetCombo) return null;

  const candidates = bindings.filter((b) => {
    if (!b.enabled) return false;
    if (normalizeKeyCombo(b.effectiveBinding) !== targetCombo) return false;
    if (b.scope === 'modal' && !context.modalOpen) return false;
    if (
      (b.scope === 'page' || b.scope === 'component') &&
      context.activeSurface &&
      b.surface !== 'global_shell' &&
      b.surface !== context.activeSurface
    ) {
      return false;
    }
    return true;
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const rankDiff = SCOPE_PRECEDENCE_RANK[b.scope] - SCOPE_PRECEDENCE_RANK[a.scope];
    if (rankDiff !== 0) return rankDiff;
    return a.id.localeCompare(b.id);
  });

  return candidates[0] ?? null;
}
