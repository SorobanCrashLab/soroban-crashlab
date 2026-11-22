'use client';

/**
 * components/AccessibilityProvider — hydrates a11y prefs post-mount (#1668).
 * Pre-paint values are set by the inline bootstrap in layout.tsx; this keeps
 * runtime, cross-tab sync, and OS reduced-motion tracking consistent.
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  applyAccessibilityPrefsToDocument,
  DEFAULT_ACCESSIBILITY_PREFS,
  parseAccessibilityPrefs,
  type AccessibilityPrefs,
} from '../lib/accessibility-prefs';
import { accessibilityPrefsStore } from '../lib/storage-registry';

interface AccessibilityContextType {
  prefs: AccessibilityPrefs;
  setPrefs: (next: AccessibilityPrefs) => void;
  mounted: boolean;
}

const AccessibilityContext = createContext<AccessibilityContextType>({
  prefs: DEFAULT_ACCESSIBILITY_PREFS,
  setPrefs: () => {},
  mounted: false,
});

export function useAccessibility() {
  return useContext(AccessibilityContext);
}

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefsState] = useState<AccessibilityPrefs>(DEFAULT_ACCESSIBILITY_PREFS);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const stored = accessibilityPrefsStore.get();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate persisted accessibility prefs once on mount
      if (stored) setPrefsState(parseAccessibilityPrefs(stored));
    } catch {
      /* keep defaults */
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || typeof document === 'undefined') return;
    applyAccessibilityPrefsToDocument(prefs, document);
    try {
      accessibilityPrefsStore.set(prefs);
    } catch {
      /* ignore quota errors */
    }
  }, [prefs, mounted]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== accessibilityPrefsStore.key || !e.newValue) return;
      try {
        setPrefsState(parseAccessibilityPrefs(JSON.parse(e.newValue)));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo(() => ({ prefs, setPrefs: setPrefsState, mounted }), [prefs, mounted]);
  return <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>;
}
