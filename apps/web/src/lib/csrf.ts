import { NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';

/**
 * Central CSRF defense for mutating API routes.
 *
 * Two layers of protection:
 *  1. Header checks (Origin / Sec-Fetch-Site) for browser-session requests.
 *  2. Double-submit token flow for routes where header checks are insufficient.
 */

export type CsrfAuthClass = 'browser-session' | 'bearer-token' | 'public';

export interface CsrfOptions {
  /** How the route is authenticated. */
  authClass?: CsrfAuthClass;
  /** Require a valid double-submit token in addition to header checks. */
  requireDoubleSubmit?: boolean;
  /** Explicitly mark a bearer-authenticated route as non-browser (exempt from browser checks). */
  nonBrowser?: boolean;
  /** Override the expected origin (host). Defaults to the request host. */
  expectedHost?: string;
}

const CSRF_COOKIE_NAME = '_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_TOKEN_TTL = 60 * 60 * 1000; // 1 hour

const mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * In-memory store of issued CSRF tokens. Each token is single-use and
 * expires after CSRF_TOKEN_TTL. This is sufficient for a single-process deploy;
 * for multi-instance deployments this should be backed by shared storage.
 */
interface IssuedToken {
  expiresAt: number;
}

const issuedTokens = new Map<string, IssuedToken>();

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function pruneExpiredTokens(now: number = Date.now()): void {
  for (const [hash, entry] of issuedTokens) {
    if (entry.expiresAt <= now) {
      issuedTokens.delete(hash);
    }
  }
}

/**
 * Issue a new single-use CSRF token. Returns the raw token to be set in a
 * cookie and echoed back by the client in the CSRF header.
 */
export function issueCsrfToken(): { token: string; expiresAt: number } {
  pruneExpiredTokens();
  const token = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + CSRF_TOKEN_TTL;
  issuedTokens.set(hashToken(token), { expiresAt });
  return { token, expiresAt };
}

/**
 * Consume a double-submit token. Tokens are strictly single-use: a valid
 * consumption removes the token from the store. Returns true when the token
 * existed, was not expired, and was removed.
 */
export function consumeCsrfToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const hash = hashToken(token);
  const entry = issuedTokens.get(hash);
  if (!entry) return false;
  issuedTokens.delete(hash);
  return entry.expiresAt > Date.now();
}

/** Test helper: clear all issued tokens. */
export function _resetCsrfTokensForTests(): void {
  issuedTokens.clear();
}

export const CSRF_COOKIE_HEADER = CSRF_COOKIE_NAME;
export const CSRF_TOKEN_HEADER = CSRF_HEADER_NAME;

function normalizeHost(host: string): string {
  return host.trim().toLowerCase();
}

function getRequestHost(request: Request): string {
  const hostHeader = request.headers.get('host');
  if (hostHeader) return normalizeHost(hostHeader);
  try {
    return normalizeHost(new URL(request.url).host);
  } catch {
    return '';
  }
}

function getOriginHost(origin: string): string | null {
  try {
    return normalizeHost(new URL(origin).host);
  } catch {
    return null;
  }
}

function isBearerAuthorized(request: Request): boolean {
  const authorization = request.headers.get('authorization');
  if (!authorization) return false;
  return /^Bearer\s+/i.test(authorization);
}

function hasSessionCookie(request: Request): boolean {
  const cookie = request.headers.get('cookie');
  if (!cookie) return false;
  // Any cookie presence indicates a potentially cookie-authenticated browser request.
  return cookie.trim().length > 0;
}

function csrfError(message: string, status = 403): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Resolve the auth class for a request given the route's declared class.
 */
export function resolveAuthClass(
  request: Request,
  options: CSrfOptions = {},
): CSrfAuthClass {
  if (options.authClass) return options.authClass;
  if (isBearerAuthorized(request)) return 'bearer-token';
  if (hasSessionCookie(request)) return 'browser-session';
  return 'public';
}

/**
 * Verify the request is same-origin based on Origin / Sec-Fetch-Site.
 * Returns null when the request passes, or an error response when it fails.
 */
export function verifyOrigin(
  request: Request,
  options: CSrfOptions = {},
): NextResponse | null {
  const expectedHost = options.expectedHost
    ? normalizeHost(options.expectedHost)
    : getRequestHost(request);

  const origin = request.headers.get('origin');
  if (origin) {
    const originHost = getOriginHost(origin);
    if (!originHost) {
      return csrfError('Invalid Origin header.');
    }
    if (!expectedHost || originHost !== expectedHost) {
      return csrfError('Cross-origin request rejected.');
    }
  }

  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite) {
    const normalized = secFetchSite.toLowerCase();
    if (normalized !== 'same-origin' && normalized !== 'none') {
      return csrfError('Cross-site request rejected.');
    }
  }

  // Browser-session requests without any origin signal are suspicious.
  if (!origin && !secFetchSite) {
    return csrfError('Missing Origin or Sec-Fetch-Site header.');
  }

  return null;
}

/**
 * Verify the double-submit token flow. The client must send the token in
 * the CSRF header and the same token is consumed from the server store.
 */
export function verifyDoubleSubmitToken(request: Request): NextResponse | null {
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  if (!headerToken) {
    return csrfError('Missing CSRF token header.', 403);
  }
  if (!consumeCsrfToken(headerToken)) {
    return csrfError('Invalid or expired CSRF token.', 403);
  }
  return null;
}

/**
 * Central CSRF guard. Applied to every mutating route via the shared route
 * wrapper. Returns null when the request is allowed, or an error response.
 */
export function enforceCsrf(
  request: Request,
  options: CsrfOptions = {},
): NextResponse | null {
  const method = request.method.toUpperCase();
  if (!mutatingMethods.has(method)) {
    return null;
  }

  const authClass = resolveAuthClass(request, options);

  // Bearer-token requests are exempt only when explicitly marked non-browser.
  if (authClass === 'bearer-token' && options.nonBrowser) {
    return null;
  }

  // Browser-session and public mutating requests must pass origin checks.
  const originFailure = verifyOrigin(request, options);
  if (originFailure) return originFailure;

  if (options.requireDoubleSubmit) {
    const tokenFailure = verifyDoubleSubmitToken(request);
    if (tokenFailure) return tokenFailure;
  }

  return null;
}

type RouteHandler = (request: any, context: any) => Promise<Response | undefined> | Response | undefined;

/**
 * Deny-by-default helper: wrap a mutating route handler so that CSRF is
 * enforced unless the route explicitly opts out (e.g. bearer-only non-browser).
 */
export function withCsrfGuard<H extends RouteHandler>(
  handler: H,
  options: CsrfOptions = {},
): H {
  const wrapped = async (request: Request, context: unknown) => {
    const csrfFailure = enforceCsrf(request, options);
    if (csrfFailure) return csrfFailure;
    return handler(request as any, context as any);
  };
  return wrapped as unknown as H;
}

/**
 * Alias for withCsrfGuard kept for consistency with existing route imports.
 */
export const withCsrfProtection = withCsrfGuard;

export const CSRF_MUTATING_METHODS = mutatingMethods;
