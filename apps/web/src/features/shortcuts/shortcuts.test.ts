import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHORTCUT_CATALOG,
  formatShortcutForPlatform,
  matchShortcutCommandForKey,
  normalizeKeyCombo,
  resolveEffectiveShortcuts,
  type ShortcutCommandDefinition,
} from './shortcutRegistry';
import {
  detectAllShortcutConflicts,
  hasProtectiveModifierOrChord,
  parseShortcutProfileBundle,
  serializeShortcutProfileBundle,
  suggestSafeFallbackBinding,
  validateProposedBinding,
} from './conflictResolution';

describe('Keyboard Shortcuts & Power-User Customization Center (#2315)', () => {
  describe('Chord Normalization & Platform Formatting', () => {
    it('normalizes modifier order, aliases, and multi-step chords deterministically', () => {
      expect(normalizeKeyCombo('shift + ctrl + k')).toBe('Ctrl+Shift+K');
      expect(normalizeKeyCombo('cmd + opt + n')).toBe('Alt+Meta+N');
      expect(normalizeKeyCombo('esc')).toBe('Escape');
      expect(normalizeKeyCombo('g r')).toBe('G then R');
      expect(normalizeKeyCombo('g then d')).toBe('G then D');
    });

    it('formats bindings for standard and macOS notation', () => {
      expect(formatShortcutForPlatform('Ctrl+Alt+Shift+K', 'standard')).toBe(
        'Ctrl+Alt+Shift+K',
      );
      expect(formatShortcutForPlatform('Ctrl+Alt+Shift+Meta+K', 'mac')).toBe(
        '⌃⌥⇧⌘K',
      );
    });
  });

  describe('Central Registry, Scope Precedence & Effective Resolution', () => {
    it('merges custom bindings and disabled IDs over the default catalog', () => {
      const effective = resolveEffectiveShortcuts(
        { 'diff.next_divergence': 'alt+j' },
        ['logs.toggle_autoscroll'],
      );

      const diffCmd = effective.find((c) => c.id === 'diff.next_divergence');
      expect(diffCmd?.effectiveBinding).toBe('Alt+J');
      expect(diffCmd?.isCustomized).toBe(true);

      const logsCmd = effective.find((c) => c.id === 'logs.toggle_autoscroll');
      expect(logsCmd?.enabled).toBe(false);
    });

    it('resolves overlapping key bindings using strict scope precedence (modal > component > page > global)', () => {
      const testCatalog: ShortcutCommandDefinition[] = [
        {
          id: 'test.global_enter',
          title: 'Global Enter',
          description: '',
          scope: 'global',
          surface: 'global_shell',
          defaultBinding: 'Enter',
          nonKeyboardAlternative: 'Button A',
        },
        {
          id: 'test.component_enter',
          title: 'Trace Frame Enter',
          description: '',
          scope: 'component',
          surface: 'trace',
          defaultBinding: 'Enter',
          nonKeyboardAlternative: 'Button B',
        },
        {
          id: 'test.modal_enter',
          title: 'Modal Confirm Enter',
          description: '',
          scope: 'modal',
          surface: 'global_shell',
          defaultBinding: 'Enter',
          nonKeyboardAlternative: 'Button C',
        },
      ];

      const resolvedList = resolveEffectiveShortcuts({}, [], testCatalog);

      // When modal is open, modal scope wins
      const modalMatch = matchShortcutCommandForKey('Enter', resolvedList, {
        activeSurface: 'trace',
        modalOpen: true,
      });
      expect(modalMatch?.id).toBe('test.modal_enter');

      // When modal is closed on the trace surface, component scope wins over global
      const componentMatch = matchShortcutCommandForKey('Enter', resolvedList, {
        activeSurface: 'trace',
        modalOpen: false,
      });
      expect(componentMatch?.id).toBe('test.component_enter');

      // When on an unrelated surface with modal closed, global scope handles it
      const globalMatch = matchShortcutCommandForKey('Enter', resolvedList, {
        activeSurface: 'logs',
        modalOpen: false,
      });
      expect(globalMatch?.id).toBe('test.global_enter');
    });

    it('declares a non-keyboard UI alternative for every command in the default catalog', () => {
      expect(DEFAULT_SHORTCUT_CATALOG.length).toBeGreaterThanOrEqual(12);
      for (const cmd of DEFAULT_SHORTCUT_CATALOG) {
        expect(cmd.nonKeyboardAlternative.trim().length).toBeGreaterThan(5);
      }
    });
  });

  describe('Conflict Detection, Reserved Keys & Audit-Safe Privileged Guardrails', () => {
    it('blocks reserved browser, OS, and WCAG focus traversal shortcuts', () => {
      const active = resolveEffectiveShortcuts();
      const target = DEFAULT_SHORTCUT_CATALOG[0]!;

      const ctrlWConflict = validateProposedBinding(target, 'Ctrl+W', active);
      expect(ctrlWConflict?.kind).toBe('reserved_browser_os');

      const tabConflict = validateProposedBinding(target, 'Tab', active);
      expect(tabConflict?.kind).toBe('reserved_browser_os');
    });

    it('enforces audit-safe guardrails preventing bare single-key shortcuts on privileged/destructive commands', () => {
      const active = resolveEffectiveShortcuts();
      const deleteCmd = DEFAULT_SHORTCUT_CATALOG.find(
        (c) => c.id === 'run.delete_selected',
      )!;
      expect(deleteCmd.privileged).toBe(true);

      const unsafeIssue = validateProposedBinding(deleteCmd, 'X', active);
      expect(unsafeIssue).not.toBeNull();
      expect(unsafeIssue?.kind).toBe('unsafe_privileged_single_key');

      const safeIssue = validateProposedBinding(deleteCmd, 'Ctrl+Shift+X', active);
      expect(safeIssue).toBeNull();
      expect(hasProtectiveModifierOrChord('Ctrl+Shift+X')).toBe(true);
    });

    it('detects duplicate bindings within colliding scopes and suggests safe fallbacks', () => {
      const active = resolveEffectiveShortcuts();
      const navRuns = DEFAULT_SHORTCUT_CATALOG.find(
        (c) => c.id === 'global.nav_runs',
      )!;

      // Ctrl+K is already used by global.command_palette in global/global_shell
      const conflict = validateProposedBinding(navRuns, 'Ctrl+K', active);
      expect(conflict?.kind).toBe('duplicate_in_scope');
      expect(conflict?.conflictingCommandId).toBe('global.command_palette');
      expect(conflict?.suggestedAlternative).toBeTruthy();

      const fallback = suggestSafeFallbackBinding(navRuns.id, active);
      expect(validateProposedBinding(navRuns, fallback, active)).toBeNull();
    });

    it('verifies the default catalog has zero built-in conflicts', () => {
      const active = resolveEffectiveShortcuts();
      expect(detectAllShortcutConflicts(active)).toEqual([]);
    });
  });

  describe('Profile Bundle Serialization & Import Validation', () => {
    it('round-trips valid shortcut profile JSON bundles and filters reserved or unknown entries on import', () => {
      const json = serializeShortcutProfileBundle({
        profileName: 'audit-power-user',
        workspaceScope: 'contract-audit',
        customBindings: {
          'diff.next_divergence': 'Alt+J',
        },
        disabledIds: ['logs.focus_search'],
      });

      const parsed = parseShortcutProfileBundle(json);
      expect(parsed.errors).toEqual([]);
      expect(parsed.bundle?.profileName).toBe('audit-power-user');
      expect(parsed.bundle?.customBindings['diff.next_divergence']).toBe('Alt+J');
      expect(parsed.bundle?.disabledIds).toEqual(['logs.focus_search']);

      // Test hostile/invalid import payload containing a reserved key and unknown ID
      const sanitized = parseShortcutProfileBundle(
        JSON.stringify({
          profileName: 'hostile',
          customBindings: {
            'unknown.command': 'Alt+1',
            'diff.next_divergence': 'Ctrl+W',
            'trace.copy_event_hash': 'Alt+Shift+H',
          },
        }),
      );
      expect(sanitized.bundle?.customBindings['unknown.command']).toBeUndefined();
      expect(sanitized.bundle?.customBindings['diff.next_divergence']).toBeUndefined();
      expect(sanitized.bundle?.customBindings['trace.copy_event_hash']).toBe(
        'Alt+Shift+H',
      );
      expect(sanitized.errors).toHaveLength(2);
    });
  });
});
