import notificationsEn from "./en/notifications.json";
import landingEn from "./en/landing.json";
import startEn from "./en/start.json";

export type Locale = "en";
export const DEFAULT_LOCALE: Locale = "en";

const CATALOGS: Record<Locale, Record<string, unknown>> = {
  en: { notifications: notificationsEn, landing: landingEn, start: startEn },
};

/**
 * Returns the merged, namespaced message tree for a locale. Only `en` ships
 * content today — the lookup exists so runtime locale-switching (proven via
 * test doubling; see `src/i18n/t.test.ts`) has somewhere real to plug in once
 * translated catalogs land.
 */
export function getMessages(locale: Locale): Record<string, unknown> {
  return CATALOGS[locale] ?? CATALOGS[DEFAULT_LOCALE];
}
