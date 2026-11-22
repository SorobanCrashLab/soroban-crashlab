/**
 * Sentry release pipeline and runtime options (#1889), shared by the client
 * bootstrap, `sentry.server.config.ts`, `sentry.edge.config.ts` and
 * `next.config.ts` so every runtime agrees on DSN, release and environment.
 *
 * Pure: callers pass values in. Client code must read `NEXT_PUBLIC_*`
 * variables literally (`process.env.NEXT_PUBLIC_SENTRY_DSN`) for Next.js to
 * inline them, so this module never reads `process.env` itself.
 *
 * Env contract (docs/self-hosting/observability.md):
 *   NEXT_PUBLIC_SENTRY_DSN            DSN; unset = Sentry off everywhere
 *   NEXT_PUBLIC_SENTRY_ENVIRONMENT    environment name (default: Vercel env, else NODE_ENV)
 *   NEXT_PUBLIC_SENTRY_RELEASE        set by next.config.ts at build time
 *   SENTRY_UPLOAD_SOURCEMAPS=true     upload hidden source maps + create the release
 *   SENTRY_AUTH_TOKEN/ORG/PROJECT     required when uploading
 *   SENTRY_RELEASE                    release override (default: <name>@<version>+<git sha>)
 *   SENTRY_TUNNEL_ROUTE               same-origin tunnel path, e.g. /monitoring
 */

/** Release names are `<RELEASE_PACKAGE>@<package.json version>+<git sha>`. */
export const RELEASE_PACKAGE = 'soroban-crashlab-web';

export type DsnCheck =
  | { enabled: true; dsn: string }
  | { enabled: false; reason: 'unset' }
  | { enabled: false; reason: 'invalid'; error: string };

/**
 * Validates a DSN at boot. A malformed DSN disables Sentry with a logged error
 * instead of crashing the app or silently sending nowhere.
 *
 * Accepted: `https://<public key>@<host>[:port][/<prefix>]/<numeric project id>`
 * (`http` is allowed for a self-hosted Sentry on a private network). Legacy
 * DSNs carrying a secret key are rejected: the DSN ships to browsers.
 */
export function validateSentryDsn(raw: string | undefined): DsnCheck {
  const value = raw?.trim();
  if (!value) return { enabled: false, reason: 'unset' };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { enabled: false, reason: 'invalid', error: 'DSN is not a URL.' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { enabled: false, reason: 'invalid', error: 'DSN must use https (or http for a private self-hosted Sentry).' };
  }
  if (!url.username) return { enabled: false, reason: 'invalid', error: 'DSN is missing its public key.' };
  if (url.password) {
    return { enabled: false, reason: 'invalid', error: 'DSN contains a secret key; use the public DSN.' };
  }
  if (!/\/\d+$/.test(url.pathname)) {
    return { enabled: false, reason: 'invalid', error: 'DSN must end with a numeric project id.' };
  }
  return { enabled: true, dsn: value };
}

export function resolveSentryEnvironment(input: {
  explicit?: string;
  vercelEnv?: string;
  nodeEnv?: string;
}): string {
  return input.explicit?.trim() || input.vercelEnv?.trim() || input.nodeEnv?.trim() || 'development';
}

/**
 * `SENTRY_RELEASE` wins; otherwise `<package>@<version>+<sha>`. Sentry rejects
 * release names with whitespace or slashes, so those make the name invalid
 * (`undefined` → no release, rather than a release Sentry would refuse).
 */
export function resolveSentryRelease(input: {
  explicit?: string;
  version: string;
  gitSha?: string;
}): string | undefined {
  const name = input.explicit?.trim() || (input.gitSha ? `${RELEASE_PACKAGE}@${input.version}+${input.gitSha.trim()}` : '');
  if (!name || name.length > 200 || /[\s/\\]/.test(name) || name === '.' || name === '..') return undefined;
  return name;
}

// ─── Deny-by-default event scrubbing ─────────────────────────────────────────

/** Minimal structural view of a Sentry error event; unknown fields are dropped. */
type EventLike = Record<string, unknown>;

/** Event fields that pass through `scrubSentryEvent` (anything else is dropped). */
const COPIED_FIELDS = ['event_id', 'timestamp', 'level', 'platform', 'release', 'dist', 'environment', 'logger', 'type'];

/** Tag keys that pass through; everything else may carry user data. */
const ALLOWED_TAGS = new Set(['environment', 'runtime', 'component', 'feature', 'route', 'handled', 'mechanism']);

/** Context sections that pass through, with the keys kept in each. */
const ALLOWED_CONTEXTS: Record<string, readonly string[]> = {
  os: ['name', 'version'],
  browser: ['name', 'version'],
  runtime: ['name', 'version'],
  trace: ['trace_id', 'span_id', 'parent_span_id', 'op', 'status'],
};

const FRAME_FIELDS = ['function', 'module', 'lineno', 'colno', 'in_app', 'context_line', 'pre_context', 'post_context'];

const TEXT_REDACTIONS: Array<[RegExp, string]> = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]'],
  [/\b(scl_live_|ghp_|gho_|ghs_|github_pat_|sk_live_|xox[abp]-)[A-Za-z0-9_-]+/g, '$1[redacted]'],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[jwt]'],
  [/\b[0-9a-f]{40,}\b/gi, '[hex]'],
];

/** Redacts emails, credentials, JWTs and long hex secrets from free text. */
export function scrubText(value: string): string {
  return TEXT_REDACTIONS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

/** Drops query strings and fragments (tokens, emails and ids travel in them). */
export function stripQuery(value: string): string {
  return value.replace(/[?#].*$/, '');
}

function isRecord(value: unknown): value is EventLike {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pick(source: EventLike, keys: readonly string[]): EventLike {
  const out: EventLike = {};
  for (const key of keys) if (source[key] !== undefined) out[key] = source[key];
  return out;
}

function scrubFrame(frame: unknown): EventLike | null {
  if (!isRecord(frame)) return null;
  const out = pick(frame, FRAME_FIELDS);
  // File paths are needed to resolve source maps; their query strings are not.
  if (typeof frame.filename === 'string') out.filename = stripQuery(frame.filename);
  if (typeof frame.abs_path === 'string') out.abs_path = stripQuery(frame.abs_path);
  // `vars` (local variables) is deliberately never copied.
  return out;
}

function scrubException(exception: unknown): EventLike | undefined {
  if (!isRecord(exception) || !Array.isArray(exception.values)) return undefined;
  const values = exception.values.filter(isRecord).map((value) => {
    const out: EventLike = {};
    if (typeof value.type === 'string') out.type = value.type;
    if (typeof value.value === 'string') out.value = scrubText(value.value);
    if (isRecord(value.mechanism)) out.mechanism = pick(value.mechanism, ['type', 'handled', 'synthetic']);
    if (isRecord(value.stacktrace) && Array.isArray(value.stacktrace.frames)) {
      out.stacktrace = { frames: value.stacktrace.frames.map(scrubFrame).filter((f) => f !== null) };
    }
    return out;
  });
  return { values };
}

/**
 * `beforeSend` for every runtime (aligned with the PII policy): build a new
 * event from an allowlist instead of deleting known-bad fields, so a field the
 * SDK adds later is dropped until someone decides it is safe.
 *
 * Kept: identity/release fields, exception types, scrubbed messages, stack
 * frames (paths without query strings, no local variables), debug ids for
 * source-map resolution, allowlisted tags/contexts, the request method.
 * Dropped: user, request URL/headers/cookies/body, extra, breadcrumbs,
 * server name, modules and anything unknown.
 */
export function scrubSentryEvent<T extends object>(input: T): T {
  const event = input as unknown as EventLike;
  const out: EventLike = pick(event, COPIED_FIELDS);

  if (typeof event.message === 'string') out.message = scrubText(event.message);
  if (typeof event.transaction === 'string') out.transaction = stripQuery(event.transaction);
  if (Array.isArray(event.fingerprint)) out.fingerprint = event.fingerprint.filter((f) => typeof f === 'string');

  const exception = scrubException(event.exception);
  if (exception) out.exception = exception;

  if (isRecord(event.sdk)) out.sdk = pick(event.sdk, ['name', 'version']);

  if (isRecord(event.tags)) {
    const tags: EventLike = {};
    for (const [key, value] of Object.entries(event.tags)) {
      if (ALLOWED_TAGS.has(key) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) {
        tags[key] = typeof value === 'string' ? scrubText(value) : value;
      }
    }
    out.tags = tags;
  }

  if (isRecord(event.contexts)) {
    const contexts: EventLike = {};
    for (const [name, keys] of Object.entries(ALLOWED_CONTEXTS)) {
      const section = event.contexts[name];
      if (isRecord(section)) contexts[name] = pick(section, keys);
    }
    out.contexts = contexts;
  }

  if (isRecord(event.debug_meta) && Array.isArray(event.debug_meta.images)) {
    out.debug_meta = {
      images: event.debug_meta.images.filter(isRecord).map((image) => {
        const kept = pick(image, ['type', 'debug_id']);
        if (typeof image.code_file === 'string') kept.code_file = stripQuery(image.code_file);
        return kept;
      }),
    };
  }

  if (isRecord(event.request) && typeof event.request.method === 'string') {
    out.request = { method: event.request.method };
  }

  return out as unknown as T;
}

// ─── Runtime and build options ───────────────────────────────────────────────

export interface SentryRuntimeInput {
  dsn: string | undefined;
  environment: string;
  release: string | undefined;
  tracesSampleRate?: number;
}

export interface SentryRuntimeOptions {
  dsn: string;
  environment: string;
  release?: string;
  tracesSampleRate: number;
  sendDefaultPii: false;
  beforeSend: <T extends object>(event: T) => T;
}

/** `Sentry.init` options shared by client, server and edge; `null` when disabled. */
export function buildSentryRuntimeOptions(
  input: SentryRuntimeInput,
  log: (message: string) => void = (message) => console.error(message),
): SentryRuntimeOptions | null {
  const check = validateSentryDsn(input.dsn);
  if (!check.enabled) {
    if (check.reason === 'invalid') log(`[sentry] NEXT_PUBLIC_SENTRY_DSN is invalid (${check.error}); error reporting is disabled.`);
    return null;
  }
  return {
    dsn: check.dsn,
    environment: input.environment,
    ...(input.release ? { release: input.release } : {}),
    tracesSampleRate: input.tracesSampleRate ?? 1.0,
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent,
  };
}

/**
 * Reads SENTRY_UPLOAD_SOURCEMAPS, SENTRY_AUTH_TOKEN, SENTRY_ORG,
 * SENTRY_PROJECT, SENTRY_TUNNEL_ROUTE and CI (pass `process.env`).
 */
export type SentryBuildEnv = Record<string, string | undefined>;

/** Build plugin options for `withSentryConfig` (subset we set). */
export interface SentryBuildOptions {
  org?: string;
  project?: string;
  authToken?: string;
  silent: boolean;
  tunnelRoute?: string;
  release: { name?: string; create: boolean; finalize: boolean; setCommits?: { auto: true; ignoreMissing: true } };
  sourcemaps: { disable: boolean; deleteSourcemapsAfterUpload: boolean };
  widenClientFileUpload: boolean;
  telemetry: boolean;
}

/**
 * Upload is opt-in (`SENTRY_UPLOAD_SOURCEMAPS=true`) until a maintainer
 * provides keys. With the flag off the plugin never uploads, never creates a
 * release and needs no credentials, so the build is unaffected; with it on,
 * missing credentials are a configuration error reported up front.
 */
export function buildSentryBuildOptions(
  env: SentryBuildEnv,
  release: string | undefined,
): { options: SentryBuildOptions; uploadEnabled: boolean; errors: string[] } {
  const uploadEnabled = env.SENTRY_UPLOAD_SOURCEMAPS === 'true';
  const errors: string[] = [];
  if (uploadEnabled) {
    for (const name of ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT'] as const) {
      if (!env[name]?.trim()) errors.push(`${name} is required when SENTRY_UPLOAD_SOURCEMAPS=true.`);
    }
    if (!release) errors.push('No release name: set SENTRY_RELEASE or build from a git checkout.');
  }

  const tunnel = env.SENTRY_TUNNEL_ROUTE?.trim();
  if (tunnel && !/^\/[A-Za-z0-9/_-]+$/.test(tunnel)) {
    errors.push('SENTRY_TUNNEL_ROUTE must be a path such as /monitoring.');
  }

  const upload = uploadEnabled && errors.length === 0;
  return {
    uploadEnabled: upload,
    errors,
    options: {
      ...(upload ? { org: env.SENTRY_ORG, project: env.SENTRY_PROJECT, authToken: env.SENTRY_AUTH_TOKEN } : {}),
      silent: !env.CI,
      ...(tunnel && /^\/[A-Za-z0-9/_-]+$/.test(tunnel) ? { tunnelRoute: tunnel } : {}),
      release: {
        name: release,
        create: upload,
        finalize: upload,
        ...(upload ? { setCommits: { auto: true as const, ignoreMissing: true as const } } : {}),
      },
      // Client maps are emitted as hidden source maps (no sourceMappingURL)
      // and deleted after upload, so they never ship to browsers.
      sourcemaps: { disable: !upload, deleteSourcemapsAfterUpload: true },
      widenClientFileUpload: upload,
      telemetry: false,
    },
  };
}
