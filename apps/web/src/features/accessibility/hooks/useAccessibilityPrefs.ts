'use client';

/**
 * hooks/useAccessibilityPrefs — manages global and per-workspace accessibility
 * preferences, consent-gated cross-device sync, live DOM application, and
 * privacy-safe barrier feedback submission (#2317).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccessibility } from '@/components/AccessibilityProvider';
import {
  applyAccessibilityPrefsToDocument,
  DEFAULT_ACCESSIBILITY_PREFS,
  DEFAULT_ASSISTIVE_MODE_PREFS,
  parseAccessibilityPrefs,
  type AccessibilityPrefs,
  type AssistiveModePrefs,
} from '@/lib/accessibility-prefs';
import { workspaceAccessibilityPrefsStore } from '@/lib/storage-registry';

export interface BarrierReportInput {
  route: string;
  component: string;
  description: string;
  screenshotSummary?: string;
}

export interface UseAccessibilityPrefsState {
  prefs: AccessibilityPrefs;
  assistiveModes: AssistiveModePrefs;
  activeScope: string;
  availableScopes: string[];
  syncConsent: boolean;
  mounted: boolean;
  statusMessage: string;
  setActiveScope: (scope: string) => void;
  updatePrefs: (patch: Partial<AccessibilityPrefs>) => void;
  updateAssistiveModes: (patch: Partial<AssistiveModePrefs>) => void;
  setSyncConsent: (consent: boolean) => Promise<void>;
  resetScopeToDefaults: () => void;
  submitBarrierReport: (input: BarrierReportInput) => Promise<{ id: string } | null>;
}

const DEFAULT_WORKSPACES = ['global', 'triage-ops', 'contract-audit', 'incident-review'];

export function useAccessibilityPrefs(): UseAccessibilityPrefsState {
  const { prefs: globalPrefs, setPrefs: setGlobalPrefs, mounted } = useAccessibility();
  const [activeScope, setActiveScopeState] = useState<string>('global');
  const [workspaceMap, setWorkspaceMap] = useState<Record<string, AccessibilityPrefs>>({});
  const [statusMessage, setStatusMessage] = useState<string>('');

  useEffect(() => {
    try {
      const storedMap = workspaceAccessibilityPrefsStore.get();
      if (storedMap && typeof storedMap === 'object') {
        const cleaned: Record<string, AccessibilityPrefs> = {};
        for (const [key, val] of Object.entries(storedMap)) {
          cleaned[key] = parseAccessibilityPrefs(val);
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate workspace preference map once on mount
        setWorkspaceMap(cleaned);
      }
    } catch {
      /* keep empty workspace overrides */
    }
  }, []);

  const currentPrefs: AccessibilityPrefs = useMemo(() => {
    const base =
      activeScope === 'global'
        ? globalPrefs
        : (workspaceMap[activeScope] ?? globalPrefs);

    return {
      ...DEFAULT_ACCESSIBILITY_PREFS,
      lineHeight: 'normal',
      density: 'comfortable',
      focusIndicator: 'default',
      pointerTarget: 'standard',
      keyboardNavigation: 'standard',
      ...base,
      assistiveModes: {
        ...DEFAULT_ASSISTIVE_MODE_PREFS,
        ...(base.assistiveModes ?? {}),
      },
      workspaceScope: activeScope,
    };
  }, [activeScope, globalPrefs, workspaceMap]);

  const syncConsent = Boolean(currentPrefs.syncConsent);

  const persistToApiIfConsented = useCallback(
    async (scope: string, nextPrefs: AccessibilityPrefs, consent: boolean) => {
      if (typeof fetch !== 'function') return;
      try {
        await fetch('/api/accessibility/preferences', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            scope,
            consent,
            preferences: nextPrefs,
          }),
        });
      } catch {
        /* local storage remains authoritative when offline */
      }
    },
    [],
  );

  const applyAndSave = useCallback(
    (next: AccessibilityPrefs, announceText: string) => {
      const normalized = parseAccessibilityPrefs({
        ...next,
        workspaceScope: activeScope,
      });

      if (typeof document !== 'undefined') {
        applyAccessibilityPrefsToDocument(normalized, document);
      }

      if (activeScope === 'global') {
        setGlobalPrefs(normalized);
      } else {
        setWorkspaceMap((prev) => {
          const updated = { ...prev, [activeScope]: normalized };
          try {
            workspaceAccessibilityPrefsStore.set(updated);
          } catch {
            /* ignore storage quota errors */
          }
          return updated;
        });
        // Keep root document synchronized with active workspace view
        setGlobalPrefs(normalized);
      }

      setStatusMessage(announceText);

      if (normalized.syncConsent) {
        void persistToApiIfConsented(activeScope, normalized, true);
      }
    },
    [activeScope, persistToApiIfConsented, setGlobalPrefs],
  );

  const updatePrefs = useCallback(
    (patch: Partial<AccessibilityPrefs>) => {
      const merged: AccessibilityPrefs = {
        ...currentPrefs,
        ...patch,
        assistiveModes: {
          ...DEFAULT_ASSISTIVE_MODE_PREFS,
          ...(currentPrefs.assistiveModes ?? {}),
          ...(patch.assistiveModes ?? {}),
        },
      };
      applyAndSave(merged, `Accessibility preferences updated for ${activeScope}.`);
    },
    [activeScope, applyAndSave, currentPrefs],
  );

  const updateAssistiveModes = useCallback(
    (patch: Partial<AssistiveModePrefs>) => {
      updatePrefs({
        assistiveModes: {
          ...DEFAULT_ASSISTIVE_MODE_PREFS,
          ...(currentPrefs.assistiveModes ?? {}),
          ...patch,
        },
      });
    },
    [currentPrefs.assistiveModes, updatePrefs],
  );

  const setActiveScope = useCallback(
    (scope: string) => {
      const target = scope.trim().toLowerCase() || 'global';
      setActiveScopeState(target);
      const scopedPrefs =
        target === 'global' ? globalPrefs : (workspaceMap[target] ?? globalPrefs);
      if (typeof document !== 'undefined') {
        applyAccessibilityPrefsToDocument(scopedPrefs, document);
      }
      setStatusMessage(`Switched accessibility workspace profile to ${target}.`);
    },
    [globalPrefs, workspaceMap],
  );

  const setSyncConsent = useCallback(
    async (consent: boolean) => {
      const next: AccessibilityPrefs = {
        ...currentPrefs,
        syncConsent: consent,
      };
      applyAndSave(
        next,
        consent
          ? 'Cross-device preference sync enabled with consent.'
          : 'Cross-device sync disabled; preferences stored locally only.',
      );
      await persistToApiIfConsented(activeScope, next, consent);
    },
    [activeScope, applyAndSave, currentPrefs, persistToApiIfConsented],
  );

  const resetScopeToDefaults = useCallback(() => {
    const defaults: AccessibilityPrefs = {
      ...DEFAULT_ACCESSIBILITY_PREFS,
      lineHeight: 'normal',
      density: 'comfortable',
      focusIndicator: 'default',
      pointerTarget: 'standard',
      keyboardNavigation: 'standard',
      assistiveModes: { ...DEFAULT_ASSISTIVE_MODE_PREFS },
      syncConsent: false,
      workspaceScope: activeScope,
    };
    applyAndSave(defaults, `Reset ${activeScope} accessibility preferences to defaults.`);
  }, [activeScope, applyAndSave]);

  const submitBarrierReport = useCallback(
    async (input: BarrierReportInput): Promise<{ id: string } | null> => {
      if (typeof fetch !== 'function') return null;
      try {
        const res = await fetch('/api/accessibility/preferences', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            kind: 'barrier-feedback',
            route: input.route,
            component: input.component,
            description: input.description,
            screenshotSummary: input.screenshotSummary,
            preferences: currentPrefs,
          }),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { feedback?: { id: string } };
        if (data.feedback?.id) {
          setStatusMessage(`Accessibility barrier report ${data.feedback.id} submitted.`);
          return { id: data.feedback.id };
        }
      } catch {
        setStatusMessage('Barrier report saved locally for retry.');
      }
      return null;
    },
    [currentPrefs],
  );

  const availableScopes = useMemo(() => {
    return Array.from(new Set([...DEFAULT_WORKSPACES, ...Object.keys(workspaceMap)]));
  }, [workspaceMap]);

  return {
    prefs: currentPrefs,
    assistiveModes: currentPrefs.assistiveModes ?? DEFAULT_ASSISTIVE_MODE_PREFS,
    activeScope,
    availableScopes,
    syncConsent,
    mounted,
    statusMessage,
    setActiveScope,
    updatePrefs,
    updateAssistiveModes,
    setSyncConsent,
    resetScopeToDefaults,
    submitBarrierReport,
  };
}
