import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-response-utils';
import { logger } from '@/lib/logger';
import { OIDC_STATE_COOKIE, PENDING_LOGIN_TTL_MS } from '@/lib/auth/oidc';
import { getOidcClient } from '@/lib/auth/oidc-runtime';

/**
 * GET /api/auth/oidc/start (#1893)
 *
 * Starts an authorization-code + PKCE login against the pinned issuer. The
 * state is bound to this browser with an httpOnly cookie; nonce and code
 * verifier never leave the server.
 */
export async function GET() {
  try {
    const { url, state } = await getOidcClient().start();
    const response = NextResponse.redirect(url, { status: 302 });
    response.cookies.set(OIDC_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth/oidc',
      maxAge: PENDING_LOGIN_TTL_MS / 1000,
    });
    return response;
  } catch (error) {
    logger.warn('GET /api/auth/oidc/start: OIDC unavailable', {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('External sign-in is not available.', 503);
  }
}
