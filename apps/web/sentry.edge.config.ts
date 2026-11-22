/**
 * Sentry for the edge runtime (proxy and edge routes) (#1889), loaded by
 * `register()` in src/instrumentation.ts. Mirrors sentry.server.config.ts.
 */
import * as Sentry from '@sentry/nextjs';
import { buildSentryRuntimeOptions, resolveSentryEnvironment } from './src/lib/integrations/sentry-options';

const options = buildSentryRuntimeOptions({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: resolveSentryEnvironment({
    explicit: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    vercelEnv: process.env.VERCEL_ENV,
    nodeEnv: process.env.NODE_ENV,
  }),
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
});

if (options) Sentry.init(options);
