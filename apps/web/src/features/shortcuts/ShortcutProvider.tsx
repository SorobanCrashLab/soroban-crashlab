'use client';

/**
 * ShortcutProvider — manages workspace-scoped keyboard shortcut profiles,
 * telemetry-free local persistence (`shortcutCustomizationStore`), conflict
 * detection, import/export, cheat sheet visibility, and audit-safe privileged
 * action confirmation prompts (#2315).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  shortcutCustomizationStore,
  type StoredShortcutProfile,
} from '@/lib/storage-registry';
import {
  detectAllShortcutConflicts,
  parseShortcutProfileBundle,
  serializeShortcutProfileBundle,
  validateProposedBinding,
  type ShortcutConflictIssue,
} from './conflictResolution';
import {
  DEFAULT_SHORTCUT_CATALOG,
  matchShortcutCommandForKey,
  normalizeKeyCombo,
  resolveEffectiveShortcuts,
  type EffectiveShortcutBinding,
  type ShortcutSurface,
} from './shortcutRegistry';

export interface PendingPrivilegedConfirmation {
  command: EffectiveShortcutBinding;
  onConfirm: () => void;
}

export interface ShortcutContextValue {
  workspaceScope: string;
  profileName: string;
  activeSurface: ShortcutSurface;
  bindings: EffectiveShortcutBinding[];
  conflicts: ShortcutConflictIssue[];
  cheatSheetOpen: boolean;
  statusAnnouncement: string;
  pendingConfirmation: PendingPrivilegedConfirmation | null;
  setWorkspaceScope: (scope: string) => void;
  setProfileName: (name: string) => void;
  setActiveSurface: (surface: ShortcutSurface) => void;
  setCheatSheetOpen: (open: boolean) => void;
  remapShortcut: (
    commandId: string,
    proposedBinding: string,
  ) => { ok: boolean; conflict?: ShortcutConflictIssue };
  resetSingleShortcut: (commandId: string) => void;
  toggleShortcutEnabled: (commandId: string, enabled: boolean) => void;
  resetAllToDefaults: () => void;
  exportProfileJson: () => string;
  importProfileJson: (rawJson: string) => { ok: boolean; errors: string[] };
  triggerCommandById: (commandId: string, handler?: () => void) => void;
  confirmPrivilegedAction: () => void;
  cancelPrivilegedAction: () => void;
}

const DEFAULT_BINDINGS = resolveEffectiveShortcuts({}, []);

const ShortcutContext = createContext<ShortcutContextValue>({
  workspaceScope: 'global',
  profileName: 'default',
  activeSurface: 'global_shell',
  bindings: DEFAULT_BINDINGS,
  conflicts: [],
  cheatSheetOpen: false,
  statusAnnouncement: '',
  pendingConfirmation: null,
  setWorkspaceScope: () => {},
  setProfileName: () => {},
  setActiveSurface: () => {},
  setCheatSheetOpen: () => {},
  remapShortcut: () => ({ ok: false }),
  resetSingleShortcut: () => {},
  toggleShortcutEnabled: () => {},
  resetAllToDefaults: () => {},
  exportProfileJson: () => '{}',
  importProfileJson: () => ({ ok: false, errors: [] }),
  triggerCommandById: () => {},
  confirmPrivilegedAction: () => {},
  cancelPrivilegedAction: () => {},
});

export function useShortcutContext(): ShortcutContextValue {
  return useContext(ShortcutContext);
}

export interface ShortcutProviderProps {
  initialScope?: string;
  children: React.ReactNode;
}

export function ShortcutProvider({
  initialScope = 'global',
  children,
}: ShortcutProviderProps) {
  const [workspaceScope, setWorkspaceScopeState] = useState<string>(initialScope);
  const [profileName, setProfileName] = useState<string>('default');
  const [activeSurface, setActiveSurface] = useState<ShortcutSurface>('global_shell');
  const [profilesByScope, setProfilesByScope] = useState<
    Record<string, StoredShortcutProfile>
  >({});
  const [cheatSheetOpen, setCheatSheetOpen] = useState<boolean>(false);
  const [statusAnnouncement, setStatusAnnouncement] = useState<string>('');
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingPrivilegedConfirmation | null>(null);

  useEffect(() => {
    try {
      const stored = shortcutCustomizationStore.get();
      if (stored && typeof stored === 'object') {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate persisted shortcut profiles once on mount
        setProfilesByScope(stored);
      }
    } catch {
      /* keep empty customization map */
    }
  }, []);

  const currentProfile: StoredShortcutProfile = useMemo(() => {
    const existing = profilesByScope[workspaceScope];
    if (existing) return existing;
    return {
      profileName,
      workspaceScope,
      customBindings: {},
      disabledIds: [],
      updatedAt: new Date().toISOString(),
    };
  }, [profileName, profilesByScope, workspaceScope]);

  const bindings = useMemo(
    () =>
      resolveEffectiveShortcuts(
        currentProfile.customBindings,
        currentProfile.disabledIds,
        DEFAULT_SHORTCUT_CATALOG,
      ),
    [currentProfile.customBindings, currentProfile.disabledIds],
  );

  const conflicts = useMemo(
    () => detectAllShortcutConflicts(bindings),
    [bindings],
  );

  const saveProfileForScope = useCallback(
    (nextProfile: StoredShortcutProfile, announcement: string) => {
      setProfilesByScope((prev) => {
        const updated = {
          ...prev,
          [workspaceScope]: nextProfile,
        };
        try {
          shortcutCustomizationStore.set(updated);
        } catch {
          /* ignore quota error */
        }
        return updated;
      });
      setStatusAnnouncement(announcement);
    },
    [workspaceScope],
  );

  const setWorkspaceScope = useCallback((scope: string) => {
    const cleaned = scope.trim().toLowerCase() || 'global';
    setWorkspaceScopeState(cleaned);
    setStatusAnnouncement(`Switched shortcut profile scope to ${cleaned}.`);
  }, []);

  const remapShortcut = useCallback(
    (
      commandId: string,
      proposedBinding: string,
    ): { ok: boolean; conflict?: ShortcutConflictIssue } => {
      const cmd = DEFAULT_SHORTCUT_CATALOG.find((c) => c.id === commandId);
      if (!cmd) return { ok: false };

      const conflict = validateProposedBinding(cmd, proposedBinding, bindings);
      if (conflict) {
        setStatusAnnouncement(`Shortcut conflict: ${conflict.message}`);
        return { ok: false, conflict };
      }

      const canonical = normalizeKeyCombo(proposedBinding);
      const nextCustom = {
        ...currentProfile.customBindings,
        [commandId]: canonical,
      };
      saveProfileForScope(
        {
          ...currentProfile,
          customBindings: nextCustom,
          updatedAt: new Date().toISOString(),
        },
        `Remapped "${cmd.title}" to ${canonical}.`,
      );
      return { ok: true };
    },
    [bindings, currentProfile, saveProfileForScope],
  );

  const resetSingleShortcut = useCallback(
    (commandId: string) => {
      const cmd = DEFAULT_SHORTCUT_CATALOG.find((c) => c.id === commandId);
      if (!cmd) return;
      const nextCustom = { ...currentProfile.customBindings };
      delete nextCustom[commandId];
      const nextDisabled = currentProfile.disabledIds.filter((id) => id !== commandId);
      saveProfileForScope(
        {
          ...currentProfile,
          customBindings: nextCustom,
          disabledIds: nextDisabled,
          updatedAt: new Date().toISOString(),
        },
        `Reset "${cmd.title}" to default binding (${cmd.defaultBinding}).`,
      );
    },
    [currentProfile, saveProfileForScope],
  );

  const toggleShortcutEnabled = useCallback(
    (commandId: string, enabled: boolean) => {
      const cmd = DEFAULT_SHORTCUT_CATALOG.find((c) => c.id === commandId);
      if (!cmd) return;
      const disabledSet = new Set(currentProfile.disabledIds);
      if (enabled) disabledSet.delete(commandId);
      else disabledSet.add(commandId);

      saveProfileForScope(
        {
          ...currentProfile,
          disabledIds: Array.from(disabledSet),
          updatedAt: new Date().toISOString(),
        },
        `${enabled ? 'Enabled' : 'Disabled'} shortcut for "${cmd.title}".`,
      );
    },
    [currentProfile, saveProfileForScope],
  );

  const resetAllToDefaults = useCallback(() => {
    saveProfileForScope(
      {
        profileName,
        workspaceScope,
        customBindings: {},
        disabledIds: [],
        updatedAt: new Date().toISOString(),
      },
      `Reset all keyboard shortcuts in ${workspaceScope} to defaults.`,
    );
  }, [profileName, saveProfileForScope, workspaceScope]);

  const exportProfileJson = useCallback((): string => {
    return serializeShortcutProfileBundle({
      profileName: currentProfile.profileName || profileName,
      workspaceScope,
      customBindings: currentProfile.customBindings,
      disabledIds: currentProfile.disabledIds,
    });
  }, [currentProfile, profileName, workspaceScope]);

  const importProfileJson = useCallback(
    (rawJson: string): { ok: boolean; errors: string[] } => {
      const { bundle, errors } = parseShortcutProfileBundle(rawJson);
      if (!bundle) {
        setStatusAnnouncement('Failed to import shortcut profile bundle.');
        return { ok: false, errors };
      }

      saveProfileForScope(
        {
          profileName: bundle.profileName,
          workspaceScope,
          customBindings: bundle.customBindings,
          disabledIds: bundle.disabledIds,
          updatedAt: new Date().toISOString(),
        },
        `Imported shortcut profile "${bundle.profileName}" (${Object.keys(bundle.customBindings).length} custom bindings).`,
      );
      return { ok: true, errors };
    },
    [saveProfileForScope, workspaceScope],
  );

  const triggerCommandById = useCallback(
    (commandId: string, handler?: () => void) => {
      const cmd = bindings.find((b) => b.id === commandId);
      if (!cmd || !cmd.enabled) return;

      const executeAction = () => {
        if (handler) handler();
        setStatusAnnouncement(`Executed command "${cmd.title}".`);
      };

      // Audit-safe default: privileged or destructive commands never execute silently
      if (cmd.privileged || cmd.requiresConfirmation) {
        setPendingConfirmation({
          command: cmd,
          onConfirm: executeAction,
        });
        setStatusAnnouncement(
          `Confirmation required before executing privileged command "${cmd.title}".`,
        );
        return;
      }

      executeAction();
    },
    [bindings],
  );

  const confirmPrivilegedAction = useCallback(() => {
    if (!pendingConfirmation) return;
    const { onConfirm } = pendingConfirmation;
    setPendingConfirmation(null);
    onConfirm();
  }, [pendingConfirmation]);

  const cancelPrivilegedAction = useCallback(() => {
    if (!pendingConfirmation) return;
    setStatusAnnouncement(
      `Cancelled privileged command "${pendingConfirmation.command.title}".`,
    );
    setPendingConfirmation(null);
  }, [pendingConfirmation]);

  const value = useMemo<ShortcutContextValue>(
    () => ({
      workspaceScope,
      profileName,
      activeSurface,
      bindings,
      conflicts,
      cheatSheetOpen,
      statusAnnouncement,
      pendingConfirmation,
      setWorkspaceScope,
      setProfileName,
      setActiveSurface,
      setCheatSheetOpen,
      remapShortcut,
      resetSingleShortcut,
      toggleShortcutEnabled,
      resetAllToDefaults,
      exportProfileJson,
      importProfileJson,
      triggerCommandById,
      confirmPrivilegedAction,
      cancelPrivilegedAction,
    }),
    [
      activeSurface,
      bindings,
      cancelPrivilegedAction,
      cheatSheetOpen,
      confirmPrivilegedAction,
      conflicts,
      exportProfileJson,
      importProfileJson,
      pendingConfirmation,
      profileName,
      remapShortcut,
      resetAllToDefaults,
      resetSingleShortcut,
      setWorkspaceScope,
      statusAnnouncement,
      toggleShortcutEnabled,
      triggerCommandById,
      workspaceScope,
    ],
  );

  return (
    <ShortcutContext.Provider value={value}>{children}</ShortcutContext.Provider>
  );
}

export { matchShortcutCommandForKey };
export default ShortcutProvider;
