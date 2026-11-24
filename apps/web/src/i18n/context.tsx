'use client';

import { createContext, useContext, useMemo, useState, useEffect, type ReactNode } from 'react';
import { createTranslator, type Translate } from './t';
import { getMessages } from './catalogs';
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, isSupportedLocale, type Locale } from './config';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
  mounted: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function getStoredLocale(): Locale | null {
  if (typeof document === 'undefined') return null;
  try {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [key, value] = cookie.trim().split('=');
      if (key === LOCALE_COOKIE_NAME && value && isSupportedLocale(value)) {
        return value as Locale;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function getBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
  try {
    const lang = navigator.language || (navigator as any).userLanguage;
    if (!lang) return DEFAULT_LOCALE;
    
    // Check exact match first
    if (isSupportedLocale(lang)) return lang as Locale;
    
    // Check language prefix (e.g., "es-MX" → "es")
    const prefix = lang.split('-')[0];
    if (isSupportedLocale(prefix)) return prefix as Locale;
  } catch {
    return DEFAULT_LOCALE;
  }
  return DEFAULT_LOCALE;
}

/**
 * Mounted once at the app root. Locale is detected from:
 * 1. Cookie (persisted preference)
 * 2. Browser Accept-Language header (via navigator.language)
 * 3. Default locale (en)
 *
 * The `mounted` flag is used for hydration-safe relative time rendering
 * (issue #1372 precedent).
 */
export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale ?? DEFAULT_LOCALE);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Hydrate locale from cookie or browser preference after mount
    const stored = getStoredLocale();
    const detected = stored ?? getBrowserLocale();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only locale hydration
    setLocale(detected);
    setMounted(true);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: createTranslator(getMessages(locale)),
      mounted,
    }),
    [locale, mounted],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslations(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useTranslations must be used within a LocaleProvider');
  }
  return context;
}

