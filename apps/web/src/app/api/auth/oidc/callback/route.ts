import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-response-utils';
import { logger } from '@/lib/logger';
import { OIDC_STATE_COOKIE, OidcError } from '@/lib/auth/oidc';
import { getOidcClient } from '@/lib/auth/oidc-runtime';
import { DurableSessionStorageError } from '@/lib/auth/server-session';
import {
  issueOidcSession,
  OIDC_SESSION_COOKIE,
  OIDC_SESSION_MAX_AGE_SECONDS,
} from '@/lib/auth/oidc-session';
import { safeRedirectPath } from '@/lib/safe-redirect';

/**
 * GET /api/auth/oidc/callback (#1893)
 *
 * Validates state against the cookie, exchanges the code, validates the ID
 * token and maps claims to a role. Every outcome is audited by the client.
 * The caller only ever sees a generic denial — the precise reason is in the
 * audit log, not in a response an attacker can iterate against.
 */
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const cookieState = request.cookies.get(OIDC_STATE_COOKIE)?.value ?? null;

  const clearState = (response: NextResponse) => {
    response.cookies.set(OIDC_STATE_COOKIE, '', { path: '/api/auth/oidc', maxAge: 0 });
    return response;
  };

  let client;
  try {
    client = getOidcClient();
  } catch {
    return clearState(errorResponse('External sign-in is not available.', 503));
  }

  try {
    const login = await client.complete({ code: params.get('code'), state: params.get('state'), cookieState });
    const session = await issueOidcSession(
      login.identity,
      Date.now(),
      request.cookies.get(OIDC_SESSION_COOKIE)?.value,
      request.headers.get('user-agent') ?? '',
    );
    if (!session) return clearState(errorResponse('External sign-in sessions are not configured.', 503));

    // Resolve the post-auth redirect target from the 'next' query param,
    // validated against the shared safe-redirect allowlist.
    const safeNext = safeRedirectPath(params.get('next'), {
      context: 'api/auth/oidc/callback',
    });

    const response = NextResponse.redirect(new URL(safeNext, request.url), { status: 302 });
    response.cookies.set(OIDC_SESSION_COOKIE, session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: OIDC_SESSION_MAX_AGE_SECONDS,
    });
    return clearState(response);
  } catch (error) {
    if (error instanceof DurableSessionStorageError) {
      return clearState(errorResponse('External sign-in is temporarily unavailable.', 503));
    }
    logger.warn('GET /api/auth/oidc/callback: login denied', {
      reason: error instanceof OidcError ? error.code : 'internal_error',
    });
    return clearState(errorResponse('Sign-in was denied.', 403));
  }
}
