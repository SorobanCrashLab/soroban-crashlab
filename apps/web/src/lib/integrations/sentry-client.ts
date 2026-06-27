import * as Sentry from '@sentry/nextjs';

/**
 * Initializes the Sentry client-side SDK.
 * Sentry will only be initialized if the NEXT_PUBLIC_SENTRY_DSN environment variable is provided.
 */
export function initSentryClient(): void {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

  if (dsn) {
    Sentry.init({
      dsn,
      tracesSampleRate: 1.0,
    });
  }
}

/**
 * sentryAdapter provides a clean API for reporting errors and messages.
 * It handles environment-based logic to either report to Sentry or log to the console.
 */
export const sentryAdapter = {
  captureException: (error: unknown, contexts?: Record<string, any>): void => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

    if (dsn) {
      Sentry.captureException(error, { contexts });
    } else {
      console.error('[Sentry Mock] captureException:', error, contexts || '');
    }
  },

  captureMessage: (message: string, level: Sentry.SeverityLevel = 'info'): void => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

    if (dsn) {
      Sentry.captureMessage(message, level);
    } else {
      console.warn(`[Sentry Mock] captureMessage (${level}):`, message);
    }
  },
};