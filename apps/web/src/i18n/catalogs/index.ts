import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from '../config';

// English catalogs
import notificationsEn from "./en/notifications.json";
import landingEn from "./en/landing.json";
import startEn from "./en/start.json";
import commonEn from "./en/common.json";
import runsEn from "./en/runs.json";
import campaignsEn from "./en/campaigns.json";
import triageEn from "./en/triage.json";
import integrationsEn from "./en/integrations.json";
import settingsEn from "./en/settings.json";

// Spanish catalogs
import notificationsEs from "./es/notifications.json";
import landingEs from "./es/landing.json";
import startEs from "./es/start.json";
import commonEs from "./es/common.json";
import runsEs from "./es/runs.json";
import campaignsEs from "./es/campaigns.json";
import triageEs from "./es/triage.json";
import integrationsEs from "./es/integrations.json";
import settingsEs from "./es/settings.json";

// Pseudo-locale (for testing hardcoded strings and layout overflow)
import notificationsXA from "./en-XA/notifications.json";
import landingXA from "./en-XA/landing.json";
import startXA from "./en-XA/start.json";
import commonXA from "./en-XA/common.json";
import runsXA from "./en-XA/runs.json";
import campaignsXA from "./en-XA/campaigns.json";
import triageXA from "./en-XA/triage.json";
import integrationsXA from "./en-XA/integrations.json";
import settingsXA from "./en-XA/settings.json";

const CATALOGS: Record<Locale, Record<string, unknown>> = {
  en: {
    notifications: notificationsEn,
    landing: landingEn,
    start: startEn,
    common: commonEn,
    runs: runsEn,
    campaigns: campaignsEn,
    triage: triageEn,
    integrations: integrationsEn,
    settings: settingsEn,
  },
  es: {
    notifications: notificationsEs,
    landing: landingEs,
    start: startEs,
    common: commonEs,
    runs: runsEs,
    campaigns: campaignsEs,
    triage: triageEs,
    integrations: integrationsEs,
    settings: settingsEs,
  },
  'en-XA': {
    notifications: notificationsXA,
    landing: landingXA,
    start: startXA,
    common: commonXA,
    runs: runsXA,
    campaigns: campaignsXA,
    triage: triageXA,
    integrations: integrationsXA,
    settings: settingsXA,
  },
};

/**
 * Returns the merged, namespaced message tree for a locale.
 * Falls back to DEFAULT_LOCALE if the requested locale is not found.
 */
export function getMessages(locale: Locale): Record<string, unknown> {
  return CATALOGS[locale] ?? CATALOGS[DEFAULT_LOCALE];
}

export { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale };
