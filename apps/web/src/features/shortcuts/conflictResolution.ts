/**
 * conflictResolution — detects and resolves keyboard shortcut conflicts across
 * browser/OS reserved bindings, overlapping context scopes, and audit-safe
 * privileged command guardrails (#2315).
 */

import {
  DEFAULT_SHORTCUT_CATALOG,
  normalizeKeyCombo,
  type EffectiveShortcutBinding,
  type ShortcutCommandDefinition,
  type ShortcutScope,
  type ShortcutSurface,
} from './shortcutRegistry';

/** Browser & OS system chords that must never be overridden by web app remapping. */
export const RESERVED_SYSTEM_SHORTCUTS: Readonly<Record<string, string>> = {
  'Ctrl+W': 'Close browser tab',
  'Ctrl+T': 'Open new browser tab',
  'Ctrl+N': 'Open new browser window',
  'Ctrl+Q': 'Quit browser application',
  'Ctrl+R': 'Reload page',
  'Ctrl+L': 'Focus browser address bar',
  'Alt+F4': 'Close OS application window',
  Tab: 'Essential WCAG sequential focus navigation',
  'Shift+Tab': 'Essential WCAG reverse sequential focus navigation',
};

export type ShortcutConflictKind =
  | 'reserved_browser_os'
  | 'duplicate_in_scope'
  | 'unsafe_privileged_single_key';

export interface ShortcutConflictIssue {
  kind: ShortcutConflictKind;
  binding: string;
  commandId: string;
  conflictingCommandId?: string;
  scope?: ShortcutScope;
  surface?: ShortcutSurface;
  message: string;
  suggestedAlternative: string;
}

/** Checks if two bindings can collide at runtime given their scope and surface. */
export function scopesCanCollide(
  a: Pick<ShortcutCommandDefinition, 'scope' | 'surface'>,
  b: Pick<ShortcutCommandDefinition, 'scope' | 'surface'>,
): boolean {
  if (a.scope === b.scope) {
    return (
      a.surface === b.surface ||
      a.surface === 'global_shell' ||
      b.surface === 'global_shell'
    );
  }
  return false;
}

/** Checks whether a normalized binding has at least one modifier key (`Ctrl`, `Alt`, `Shift`, `Meta`) or a multi-step chord. */
export function hasProtectiveModifierOrChord(binding: string): boolean {
  const canonical = normalizeKeyCombo(binding);
  return (
    canonical.includes('Ctrl+') ||
    canonical.includes('Alt+') ||
    canonical.includes('Meta+') ||
    canonical.includes('Shift+') ||
    canonical.includes(' then ')
  );
}

/** Suggests a safe non-conflicting fallback key binding for a command. */
export function suggestSafeFallbackBinding(
  commandId: string,
  existingBindings: readonly EffectiveShortcutBinding[],
): string {
  const used = new Set(existingBindings.map((b) => normalizeKeyCombo(b.effectiveBinding)));
  const stem =
    commandId
      .split(/[._-]/)
      .pop()
      ?.charAt(0)
      .toUpperCase() || 'K';

  const candidates = [
    `Alt+Shift+${stem}`,
    `Ctrl+Alt+${stem}`,
    `Ctrl+Shift+${stem}`,
    'Alt+Shift+M',
    'Ctrl+Alt+P',
  ];

  for (const candidate of candidates) {
    const norm = normalizeKeyCombo(candidate);
    if (!used.has(norm) && !RESERVED_SYSTEM_SHORTCUTS[norm]) {
      return norm;
    }
  }
  return 'Alt+Shift+K';
}

/**
 * Validates a proposed binding for `targetCommand` against:
 * 1. Reserved browser / OS / WCAG focus keys (`RESERVED_SYSTEM_SHORTCUTS`)
 * 2. Privileged / destructive action safety (cannot bind a destructive command to a bare single key)
 * 3. Scope/surface collision with other enabled shortcuts
 */
export function validateProposedBinding(
  targetCommand: ShortcutCommandDefinition,
  proposedBinding: string,
  activeCatalog: readonly EffectiveShortcutBinding[],
): ShortcutConflictIssue | null {
  const canonical = normalizeKeyCombo(proposedBinding);
  if (!canonical) {
    return {
      kind: 'reserved_browser_os',
      binding: '',
      commandId: targetCommand.id,
      message: 'Binding cannot be empty.',
      suggestedAlternative: normalizeKeyCombo(targetCommand.defaultBinding),
    };
  }

  const reservedReason = RESERVED_SYSTEM_SHORTCUTS[canonical];
  if (reservedReason) {
    return {
      kind: 'reserved_browser_os',
      binding: canonical,
      commandId: targetCommand.id,
      message: `"${canonical}" is reserved by the browser/OS (${reservedReason}).`,
      suggestedAlternative: suggestSafeFallbackBinding(targetCommand.id, activeCatalog),
    };
  }

  if (
    (targetCommand.privileged || targetCommand.requiresConfirmation) &&
    !hasProtectiveModifierOrChord(canonical)
  ) {
    return {
      kind: 'unsafe_privileged_single_key',
      binding: canonical,
      commandId: targetCommand.id,
      message: `Audit-safe guardrail: privileged command "${targetCommand.title}" cannot be bound to a bare single key ("${canonical}"). Use a modifier chord (e.g. Ctrl+Shift+...).`,
      suggestedAlternative: normalizeKeyCombo(targetCommand.defaultBinding),
    };
  }

  for (const other of activeCatalog) {
    if (other.id === targetCommand.id || !other.enabled) continue;
    if (normalizeKeyCombo(other.effectiveBinding) !== canonical) continue;

    if (scopesCanCollide(targetCommand, other)) {
      return {
        kind: 'duplicate_in_scope',
        binding: canonical,
        commandId: targetCommand.id,
        conflictingCommandId: other.id,
        scope: other.scope,
        surface: other.surface,
        message: `"${canonical}" is already assigned to "${other.title}" (${other.id}) in the ${other.scope}/${other.surface} scope.`,
        suggestedAlternative: suggestSafeFallbackBinding(targetCommand.id, activeCatalog),
      };
    }
  }

  return null;
}

/**
 * Scans an entire effective shortcut catalog and returns all detected conflict
 * or audit-safety issues.
 */
export function detectAllShortcutConflicts(
  activeCatalog: readonly EffectiveShortcutBinding[],
): ShortcutConflictIssue[] {
  const issues: ShortcutConflictIssue[] = [];
  const seenPairs = new Set<string>();

  for (const item of activeCatalog) {
    if (!item.enabled) continue;
    const issue = validateProposedBinding(item, item.effectiveBinding, activeCatalog);
    if (issue) {
      const pairKey = issue.conflictingCommandId
        ? [issue.commandId, issue.conflictingCommandId].sort().join('::')
        : `${issue.kind}::${issue.commandId}`;
      if (!seenPairs.has(pairKey)) {
        seenPairs.add(pairKey);
        issues.push(issue);
      }
    }
  }

  return issues;
}

export interface ShortcutProfileExportBundle {
  schemaVersion: 1;
  profileName: string;
  workspaceScope: string;
  customBindings: Record<string, string>;
  disabledIds: string[];
  exportedAt: string;
}

/** Exports the user's shortcut customizations as a portable JSON bundle. */
export function serializeShortcutProfileBundle(params: {
  profileName: string;
  workspaceScope: string;
  customBindings: Record<string, string>;
  disabledIds: readonly string[];
}): string {
  const bundle: ShortcutProfileExportBundle = {
    schemaVersion: 1,
    profileName: params.profileName.trim() || 'default',
    workspaceScope: params.workspaceScope.trim() || 'global',
    customBindings: { ...params.customBindings },
    disabledIds: [...params.disabledIds],
    exportedAt: new Date().toISOString(),
  };
  return JSON.stringify(bundle, null, 2);
}

/** Parses and validates an imported JSON shortcut customization bundle safely. */
export function parseShortcutProfileBundle(rawJson: string): {
  bundle: ShortcutProfileExportBundle | null;
  errors: string[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { bundle: null, errors: ['Invalid JSON syntax in shortcut profile bundle.'] };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { bundle: null, errors: ['Shortcut profile bundle must be a JSON object.'] };
  }

  const obj = parsed as Record<string, unknown>;
  const knownIds = new Set(DEFAULT_SHORTCUT_CATALOG.map((c) => c.id));
  const customBindings: Record<string, string> = {};
  const errors: string[] = [];

  if (obj.customBindings && typeof obj.customBindings === 'object') {
    for (const [cmdId, rawCombo] of Object.entries(
      obj.customBindings as Record<string, unknown>,
    )) {
      if (!knownIds.has(cmdId)) {
        errors.push(`Skipped unknown command ID "${cmdId}".`);
        continue;
      }
      if (typeof rawCombo !== 'string' || !rawCombo.trim()) continue;
      const canonical = normalizeKeyCombo(rawCombo);
      if (RESERVED_SYSTEM_SHORTCUTS[canonical]) {
        errors.push(
          `Rejected reserved system shortcut "${canonical}" for "${cmdId}".`,
        );
        continue;
      }
      customBindings[cmdId] = canonical;
    }
  }

  const disabledIds = Array.isArray(obj.disabledIds)
    ? obj.disabledIds.filter(
        (id): id is string => typeof id === 'string' && knownIds.has(id),
      )
    : [];

  return {
    bundle: {
      schemaVersion: 1,
      profileName:
        typeof obj.profileName === 'string' && obj.profileName.trim()
          ? obj.profileName.trim()
          : 'imported-profile',
      workspaceScope:
        typeof obj.workspaceScope === 'string' && obj.workspaceScope.trim()
          ? obj.workspaceScope.trim()
          : 'global',
      customBindings,
      disabledIds,
      exportedAt: new Date().toISOString(),
    },
    errors,
  };
}
