/**
 * i18n/l10n configuration (issue #2261).
 *
 * Defines supported locales, default/fallback behavior, and RTL locale set.
 * Locale detection happens via cookie with Accept-Language fallback.
 */

export type Locale = 'en' | 'es' | 'en-XA';

export const DEFAULT_LOCALE: Locale = 'en';

export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'es', 'en-XA'] as const;

/**
 * RTL locales (right-to-left writing systems: Arabic, Hebrew, etc.).
 * When adding ar/he, add them here. en-XA (pseudo-locale) stays LTR.
 */
export const RTL_LOCALES: readonly Locale[] = [] as const;

/**
 * Fallback chain: if a key is missing in the requested locale, walk this
 * chain until a translation is found. Always ends at the default locale.
 */
export function getFallbackChain(locale: Locale): Locale[] {
  if (locale === DEFAULT_LOCALE) return [DEFAULT_LOCALE];
  // Simple chain: requested → default. Extend for regional fallbacks (e.g. es-MX → es → en).
  return [locale, DEFAULT_LOCALE];
}

export function isRTL(locale: Locale): boolean {
  return (RTL_LOCALES as readonly string[]).includes(locale);
}

export function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Cookie name for persisted locale preference.
 * Read on server (headers), written on client (locale switcher).
 */
export const LOCALE_COOKIE_NAME = 'crashlab-locale';

/**
 * Max-age for locale cookie: 1 year (365 days).
 */
export const LOCALE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
