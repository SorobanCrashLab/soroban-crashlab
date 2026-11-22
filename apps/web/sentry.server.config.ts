/**
 * Sentry for the Node.js server runtime (#1889), loaded by `register()` in
 * src/instrumentation.ts. Same DSN, release, environment and deny-by-default
 * scrubbing as the client; request sessions (release health) are on by
 * default in the server SDK. No DSN (or an invalid one) leaves Sentry off.
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
