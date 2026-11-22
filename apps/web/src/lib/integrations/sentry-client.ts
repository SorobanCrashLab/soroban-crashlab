import * as Sentry from '@sentry/nextjs';
import { safeStorage } from "../local-storage";
import {
  buildSentryRuntimeOptions,
  resolveSentryEnvironment,
  validateSentryDsn,
} from './sentry-options';

/**
 * Session key that marks the current browse as mock-data so Sentry events are
 * tagged with `environment: 'mock-data'` instead of `'production'`.
 */
export const MOCK_DATA_SESSION_KEY = 'crashlab:mock-data';

function sentryEnabled(): boolean {
  return validateSentryDsn(process.env.NEXT_PUBLIC_SENTRY_DSN).enabled;
}

/**
 * Initializes the Sentry client-side SDK.
 * Sentry is only initialized when NEXT_PUBLIC_SENTRY_DSN is set and valid
 * (an invalid DSN logs an error and leaves Sentry off). Events carry the build's
 * release (NEXT_PUBLIC_SENTRY_RELEASE, set by next.config.ts) so stack frames
 * resolve against the uploaded source maps, and browser sessions are tracked
 * for release health. `NEXT_PUBLIC_*` values are read literally so Next.js can
 * inline them into the client bundle.
 */
export function initSentryClient(): void {
  const options = buildSentryRuntimeOptions({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: resolveSentryEnvironment({
      explicit: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
      vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV,
      nodeEnv: process.env.NODE_ENV,
    }),
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  });
  if (!options) return;

  Sentry.init({
    ...options,
    // Release health: one session per page load, attributed to the release.
    integrations: (defaults) =>
      defaults.some((integration) => integration.name === 'BrowserSession')
        ? defaults
        : [...defaults, Sentry.browserSessionIntegration()],
    beforeSend(event) {
      // Deny-by-default scrubbing first; then the mock-data marker.
      const scrubbed = options.beforeSend(event);
      const isMockData = safeStorage.getItem(MOCK_DATA_SESSION_KEY, 'session') === 'true';
      scrubbed.tags = { ...scrubbed.tags, environment: isMockData ? 'mock-data' : 'production' };
      return scrubbed;
    },
  });
}

/**
 * sentryAdapter provides a clean API for reporting errors and messages.
 * It handles environment-based logic to either report to Sentry or log to the console.
 */
export const sentryAdapter = {
  captureException: (error: unknown, contexts?: Record<string, unknown>): void => {
    if (sentryEnabled()) {
      Sentry.captureException(error, { contexts: contexts as Sentry.Contexts });
    } else {
      console.error('[Sentry Mock] captureException:', error, contexts || '');
    }
  },

  captureMessage: (message: string, level: Sentry.SeverityLevel = 'info'): void => {
    if (sentryEnabled()) {
      Sentry.captureMessage(message, level);
    } else {
      console.warn(`[Sentry Mock] captureMessage (${level}):`, message);
    }
  },
};
