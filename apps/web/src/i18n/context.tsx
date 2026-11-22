'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { createTranslator, type Translate } from './t';
import { getMessages, DEFAULT_LOCALE, type Locale } from './catalogs';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Mounted once at the app root (default locale: `en`). No cookie/header
 * negotiation yet — locale-switching infrastructure is stubbed for future
 * catalogs, proven here via `setLocale` rather than shipped language content.
 */
export function LocaleProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t: createTranslator(getMessages(locale)) }),
    [locale],
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
