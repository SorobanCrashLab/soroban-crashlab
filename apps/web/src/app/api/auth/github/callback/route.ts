import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { errorResponse } from '@/lib/api-response-utils';
import { sanitizeSearchParams, sanitizeQueryParam } from '@/lib/sanitize';
import {
  GITHUB_SESSION_COOKIE,
  getGitHubSessionMaxAgeSeconds,
  issueGitHubSession,
} from '@/lib/github-session';
import {
  constantTimeEqual,
  NEXT_COOKIE_NAME,
  STATE_COOKIE_NAME,
  verifyState,
} from '@/lib/github-oauth-state';
import { safeRedirectPath } from '@/lib/safe-redirect';
import { DurableSessionStorageError } from '@/lib/auth/server-session';

/**
 * Strict allowlist of post-login redirect targets. Only same-origin relative
 * paths under these prefixes are honored; anything else falls back to `/`.
 * This prevents the callback from being used as an open redirect to an
 * attacker-controlled URL via a crafted `next` parameter.
 */
const ALLOWED_CALLBACK_REDIRECT_PREFIXES = [
  '/',
  '/runs',
  '/dashboard',
  '/settings',
  '/integrations',
  '/alerts',
];

/**
 * GET /api/auth/github/callback
 * GitHub OAuth 2.0 callback route.
 *
 * Handles the redirect from GitHub after user authorization.
 *
 * Security properties (#1559):
 *   (a) Cryptographic state binding: the login route mints an HMAC-signed
 *       state token (`<nonce>.<hex-hmac>`) stored in an HttpOnly, Secure,
 *       SameSite=Lax cookie with a 10-minute expiry. This callback verifies
 *       the returned state's signature before accepting it, so a tampered or
 *       forged state is rejected.
 *   (b) Redirect control: the post-login `next` target is checked against a
 *       strict allowlist of internal path prefixes; everything else falls
 *       back to `/`. No open redirect to a caller-influenced external URL.
 *   (c) Server-side token storage: the authorization code is never logged and
 *       never serialized to the client; the issued session is an HttpOnly,
 *       signed cookie with a short, configurable TTL.
 *   (d) Replay / raced-callback handling: the state and next cookies are
 *       cleared on every outcome (success or failure), enforcing single-use
 *       semantics so a replayed callback is rejected with 400.
 */
export async function GET(request: NextRequest) {
  const sanitizedParams = sanitizeSearchParams(new URL(request.url).searchParams);
  const rawCode = sanitizedParams.get('code');
  const rawState = sanitizedParams.get('state');
  const code = rawCode ? sanitizeQueryParam(rawCode) : null;
  const state = rawState ? sanitizeQueryParam(rawState) : null;

  // Clear the state + next cookies regardless of outcome. Single-use state:
  // once a callback has been processed the cookie is gone, so a replayed or
  // raced callback finds no matching state and is rejected below.
  const clearCookies = (response: NextResponse): NextResponse => {
    response.cookies.delete(STATE_COOKIE_NAME);
    response.cookies.delete(NEXT_COOKIE_NAME);
    return response;
  };

  if (!code) {
    logger.warn('GET /api/auth/github/callback: missing "code" parameter from GitHub callback');
    return clearCookies(
      errorResponse('Missing "code" parameter from GitHub callback.', 400)
    );
  }

  const storedState = request.cookies.get(STATE_COOKIE_NAME)?.value;

  // (a) Cryptographic state binding: verify the cookie-issued state is intact
  // (HMAC signature when a secret is configured), then require the returned
  // state to match it exactly (constant-time comparison).
  if (!state || !storedState) {
    logger.warn('GET /api/auth/github/callback: missing state parameter (possible CSRF)');
    return clearCookies(
      errorResponse('Missing OAuth state parameter. The login flow may have expired or been tampered with.', 400)
    );
  }

  const storedNonce = await verifyState(storedState);
  if (!storedNonce) {
    logger.warn('GET /api/auth/github/callback: state cookie failed cryptographic verification');
    return clearCookies(
      errorResponse('OAuth state is invalid. The login flow may have expired or been tampered with.', 400)
    );
  }

  if (!constantTimeEqual(state, storedState)) {
    logger.warn('GET /api/auth/github/callback: state mismatch (possible CSRF attack)');
    return clearCookies(
      errorResponse('OAuth state mismatch. The request may have been tampered with.', 400)
    );
  }

  // (b) Redirect control: strict allowlist for the post-login target.
  const nextParam = sanitizedParams.get('next');
  const cookieNext = request.cookies.get(NEXT_COOKIE_NAME)?.value;
  const safeNext = safeRedirectPath(
    nextParam ?? cookieNext ?? null,
    {
      allowedPrefixes: ALLOWED_CALLBACK_REDIRECT_PREFIXES,
      fallback: '/',
      context: 'api/auth/github/callback',
    }
  );

  try {
    logger.info('GET /api/auth/github/callback: exchanging code for access token');

    // Simulate API latency
    await new Promise((resolve) => setTimeout(resolve, 500));

    const mockUser = {
      id: 123456,
      login: 'octocat',
      email: 'octocat@github.com',
      name: 'The Octocat',
    };

    logger.info('GET /api/auth/github/callback: authenticated user', { login: mockUser.login });

    const response = NextResponse.redirect(new URL(safeNext, request.url), {
      status: 302,
    });

    // Note: the code exchange below is still a stub that yields a fixed user, so
    // the resulting session names that stub identity. Do not set a session
    // secret until the exchange talks to GitHub.
    const session = await issueGitHubSession(
      mockUser.login,
      request.cookies.get(GITHUB_SESSION_COOKIE)?.value,
      Date.now(),
      request.headers.get('user-agent') ?? '',
    );
    if (session) {
      response.cookies.set(GITHUB_SESSION_COOKIE, session, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: getGitHubSessionMaxAgeSeconds(),
        path: '/',
      });
    } else {
      logger.warn(
        'GET /api/auth/github/callback: no GitHub session secret configured, session not established',
      );
    }

    return clearCookies(response);
  } catch (error) {
    logger.error('GET /api/auth/github/callback failed', { error });
    return clearCookies(
      error instanceof DurableSessionStorageError
        ? errorResponse('Sign-in is temporarily unavailable.', 503)
        : errorResponse('An internal error occurred while processing the GitHub authentication.', 500)
    );
  }
}
