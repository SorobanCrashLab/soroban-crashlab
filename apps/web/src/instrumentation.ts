/**
 * Server instrumentation entrypoint.
 *
 * This file exposes the real Sentry integration adapter API for use by
 * runtime instrumentation or server-side instrumentation wiring.
 */

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

const instrumentation = { createSentryAdapter };
export default instrumentation;
