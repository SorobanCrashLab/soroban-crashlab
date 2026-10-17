// Issue #1842: Boot-time configuration validation hook
// This file is called once during server startup (Next.js instrumentation hook)

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Validate configuration at boot time
    const { validateAndThrow } = await import("./lib/config/validate");

    try {
      validateAndThrow();
      console.log("✅ Configuration validation passed");
    } catch (error) {
      console.error(
        "\n" +
          (error instanceof Error
            ? error.message
            : "Configuration validation failed"),
      );
      process.exit(1);
    }
  }
}
/**
 * Server instrumentation entrypoint.
 *
 * `register()` loads the Sentry SDK for the active runtime (#1889) and
 * `onRequestError` reports errors from server components, route handlers and
 * the proxy. Both are no-ops when NEXT_PUBLIC_SENTRY_DSN is unset.
 *
 * This file also exposes the real Sentry integration adapter API for use by
 * runtime instrumentation or server-side instrumentation wiring.
 */

import * as Sentry from '@sentry/nextjs';
import { createSentryAdapter } from './lib/integrations/sentry-adapter';
import type {
  SentryConfig,
  CrashReport,
} from './features/integrations/integrate-sentry-integration-for-crash-reporting-utils';
import type {
  SentryAdapterOptions,
  SentryConnectionTestResult,
} from './lib/integrations/sentry-adapter';

export {
  createSentryAdapter,
  type SentryAdapterOptions,
  type SentryConfig,
  type CrashReport,
  type SentryConnectionTestResult,
};

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('../sentry.server.config');
  if (process.env.NEXT_RUNTIME === 'edge') await import('../sentry.edge.config');
}

export const onRequestError = Sentry.captureRequestError;

const instrumentation = { createSentryAdapter };
export default instrumentation;
