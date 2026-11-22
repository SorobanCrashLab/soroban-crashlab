import { describe, expect, it, vi } from 'vitest';
import {
  buildSentryBuildOptions,
  buildSentryRuntimeOptions,
  resolveSentryEnvironment,
  resolveSentryRelease,
  scrubSentryEvent,
  scrubText,
  validateSentryDsn,
} from './sentry-options';

const DSN = 'https://abc123@o1.ingest.sentry.io/4504';
const SHA = '0123456789abcdef0123456789abcdef01234567';

describe('validateSentryDsn (boot-time env validation)', () => {
  it('accepts SaaS and self-hosted DSNs', () => {
    expect(validateSentryDsn(DSN)).toEqual({ enabled: true, dsn: DSN });
    expect(validateSentryDsn('http://key@sentry.internal:9000/sentry/12').enabled).toBe(true);
  });

  it('treats unset as off and malformed as off with a reason', () => {
    expect(validateSentryDsn(undefined)).toEqual({ enabled: false, reason: 'unset' });
    expect(validateSentryDsn('  ')).toEqual({ enabled: false, reason: 'unset' });
    for (const bad of ['not a url', 'ftp://k@h/1', 'https://sentry.io/1', 'https://k@sentry.io/abc', 'https://k:secret@sentry.io/1']) {
      expect(validateSentryDsn(bad)).toMatchObject({ enabled: false, reason: 'invalid' });
    }
  });
});

describe('release and environment', () => {
  it('names the release <package>@<version>+<sha> unless overridden', () => {
    expect(resolveSentryRelease({ version: '0.1.0', gitSha: SHA })).toBe(`soroban-crashlab-web@0.1.0+${SHA}`);
    expect(resolveSentryRelease({ explicit: 'v0.2.0', version: '0.1.0', gitSha: SHA })).toBe('v0.2.0');
    expect(resolveSentryRelease({ version: '0.1.0' })).toBeUndefined();
    expect(resolveSentryRelease({ explicit: 'bad/name', version: '0.1.0' })).toBeUndefined();
  });

  it('prefers the explicit environment, then the Vercel env, then NODE_ENV', () => {
    expect(resolveSentryEnvironment({ explicit: 'staging', vercelEnv: 'preview', nodeEnv: 'production' })).toBe('staging');
    expect(resolveSentryEnvironment({ vercelEnv: 'preview', nodeEnv: 'production' })).toBe('preview');
    expect(resolveSentryEnvironment({ nodeEnv: 'production' })).toBe('production');
    expect(resolveSentryEnvironment({})).toBe('development');
  });
});

describe('scrubSentryEvent (deny-by-default beforeSend)', () => {
  const event = {
    event_id: 'e1',
    level: 'error',
    platform: 'javascript',
    release: 'r1',
    environment: 'production',
    message: 'failed for alice@example.com with Bearer scl_live_abcdef123',
    transaction: '/runs/42?token=secret',
    user: { id: 'u1', email: 'alice@example.com', ip_address: '1.2.3.4' },
    request: { method: 'POST', url: 'https://app/x?email=a@b.co', headers: { cookie: 'session=1' }, data: { password: 'x' } },
    extra: { payload: 'anything' },
    breadcrumbs: [{ message: 'clicked "Delete alice"' }],
    server_name: 'prod-host-1',
    tags: { environment: 'production', userEmail: 'alice@example.com', route: '/runs/[id]' },
    contexts: { os: { name: 'Linux', version: '6', kernel: 'x' }, state: { secret: 1 }, trace: { trace_id: 't', span_id: 's' } },
    exception: {
      values: [
        {
          type: 'Error',
          value: 'token ghp_abcdefghijklmnop leaked',
          mechanism: { type: 'onerror', handled: false, data: { x: 1 } },
          stacktrace: {
            frames: [
              {
                filename: 'app:///_next/static/chunks/page.js?v=1',
                abs_path: 'https://app/_next/static/chunks/page.js?v=1',
                function: 'load',
                lineno: 1,
                colno: 2048,
                in_app: true,
                vars: { password: 'hunter2' },
              },
            ],
          },
        },
      ],
    },
    debug_meta: { images: [{ type: 'sourcemap', code_file: 'https://app/_next/static/chunks/page.js?v=1', debug_id: 'd-1', extra: 'x' }] },
    sdk: { name: 'sentry.javascript.nextjs', version: '10', packages: [{ name: 'x' }] },
  };

  const scrubbed = scrubSentryEvent(event) as Record<string, unknown>;

  it('drops user, request details, extra, breadcrumbs and server name', () => {
    for (const key of ['user', 'extra', 'breadcrumbs', 'server_name']) expect(scrubbed).not.toHaveProperty(key);
    expect(scrubbed.request).toEqual({ method: 'POST' });
  });

  it('keeps what is needed to triage and to resolve source maps', () => {
    expect(scrubbed).toMatchObject({ event_id: 'e1', level: 'error', release: 'r1', environment: 'production' });
    expect(scrubbed.debug_meta).toEqual({
      images: [{ type: 'sourcemap', debug_id: 'd-1', code_file: 'https://app/_next/static/chunks/page.js' }],
    });
    expect(scrubbed.exception).toEqual({
      values: [
        {
          type: 'Error',
          value: 'token ghp_[redacted] leaked',
          mechanism: { type: 'onerror', handled: false },
          stacktrace: {
            frames: [
              {
                function: 'load',
                lineno: 1,
                colno: 2048,
                in_app: true,
                filename: 'app:///_next/static/chunks/page.js',
                abs_path: 'https://app/_next/static/chunks/page.js',
              },
            ],
          },
        },
      ],
    });
    expect(scrubbed.sdk).toEqual({ name: 'sentry.javascript.nextjs', version: '10' });
  });

  it('redacts free text and allowlists tags and contexts', () => {
    expect(scrubbed.message).toBe('failed for [email] with Bearer [redacted]');
    expect(scrubbed.transaction).toBe('/runs/42');
    expect(scrubbed.tags).toEqual({ environment: 'production', route: '/runs/[id]' });
    expect(scrubbed.contexts).toEqual({ os: { name: 'Linux', version: '6' }, trace: { trace_id: 't', span_id: 's' } });
  });

  it('drops fields it does not know about', () => {
    expect(scrubSentryEvent({ event_id: 'x', newSdkField: { ip: '1.2.3.4' } })).toEqual({ event_id: 'x' });
  });

  it('redacts common secrets in text', () => {
    expect(scrubText(`jwt eyJhbGciOi.eyJzdWIi.c2lnbmF0dXJl sha ${SHA}`)).toBe('jwt [jwt] sha [hex]');
  });
});

describe('buildSentryRuntimeOptions', () => {
  it('returns null (Sentry off) without a DSN and logs an invalid one', () => {
    const log = vi.fn();
    expect(buildSentryRuntimeOptions({ dsn: undefined, environment: 'production', release: undefined }, log)).toBeNull();
    expect(log).not.toHaveBeenCalled();
    expect(buildSentryRuntimeOptions({ dsn: 'nope', environment: 'production', release: undefined }, log)).toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/invalid/));
  });

  it('carries release and environment, never sends default PII, and scrubs', () => {
    const options = buildSentryRuntimeOptions({ dsn: DSN, environment: 'preview', release: 'r1' });
    expect(options).toMatchObject({ dsn: DSN, environment: 'preview', release: 'r1', sendDefaultPii: false, tracesSampleRate: 1 });
    expect(options?.beforeSend({ user: { id: 1 }, event_id: 'e' })).toEqual({ event_id: 'e' });
  });
});

describe('buildSentryBuildOptions — upload behind SENTRY_UPLOAD_SOURCEMAPS', () => {
  it('flag off: no upload, no release creation, no credentials needed (build unaffected)', () => {
    const { options, uploadEnabled, errors } = buildSentryBuildOptions(
      { SENTRY_AUTH_TOKEN: 'ignored-without-the-flag' },
      'soroban-crashlab-web@0.1.0+sha',
    );
    expect(uploadEnabled).toBe(false);
    expect(errors).toEqual([]);
    expect(options.sourcemaps.disable).toBe(true);
    expect(options.release).toEqual({ name: 'soroban-crashlab-web@0.1.0+sha', create: false, finalize: false });
    expect(options).not.toHaveProperty('authToken');
    expect(options.widenClientFileUpload).toBe(false);
  });

  it('flag on without keys: reports every missing setting', () => {
    const { uploadEnabled, errors } = buildSentryBuildOptions({ SENTRY_UPLOAD_SOURCEMAPS: 'true' }, undefined);
    expect(uploadEnabled).toBe(false);
    expect(errors).toHaveLength(4);
  });

  it('flag on with keys: uploads hidden maps tied to the release and deletes them after', () => {
    const { options, uploadEnabled } = buildSentryBuildOptions(
      { SENTRY_UPLOAD_SOURCEMAPS: 'true', SENTRY_AUTH_TOKEN: 't', SENTRY_ORG: 'o', SENTRY_PROJECT: 'p', CI: 'true' },
      'r1',
    );
    expect(uploadEnabled).toBe(true);
    expect(options).toMatchObject({
      org: 'o',
      project: 'p',
      authToken: 't',
      silent: false,
      release: { name: 'r1', create: true, finalize: true, setCommits: { auto: true, ignoreMissing: true } },
      sourcemaps: { disable: false, deleteSourcemapsAfterUpload: true },
    });
  });

  it('accepts a tunnel route and rejects a malformed one', () => {
    expect(buildSentryBuildOptions({ SENTRY_TUNNEL_ROUTE: '/monitoring' }, 'r').options.tunnelRoute).toBe('/monitoring');
    expect(buildSentryBuildOptions({ SENTRY_TUNNEL_ROUTE: 'https://evil' }, 'r').errors).toHaveLength(1);
  });
});
