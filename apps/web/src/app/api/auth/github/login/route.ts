import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { errorResponse } from '@/lib/api-response-utils';
import { safeRedirectPath } from '@/lib/safe-redirect';
import {
  issueState,
  STATE_COOKIE_NAME,
  NEXT_COOKIE_NAME,
  STATE_MAX_AGE_SECONDS,
} from '@/lib/github-oauth-state';

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';

/**
 * GET /api/auth/github/login
 * Initiates the GitHub OAuth 2.0 flow.
 *
 * Generates an HMAC-signed, cryptographically bound `state` parameter and
 * stores it in a short-lived HttpOnly, Secure (production), SameSite=Lax
 * cookie (10-minute expiry), then redirects the user to GitHub's
 * authorization endpoint. The cookie is single-use: the callback clears it on
 * every outcome, so a captured or replayed state can only be used once.
 *
 * An optional `?next=` parameter is validated through the shared
 * safe-redirect validator and stashed in a short-lived cookie so the callback
 * can resume the intended deep link. Invalid values fall back to `/` with an
 * audit log entry.
 */
export async function GET(request: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID;

  if (!clientId) {
    logger.warn('GET /api/auth/github/login: GITHUB_CLIENT_ID is not configured');
    return errorResponse('GitHub OAuth is not configured.', 503);
  }

  const state = await issueState();

  const rawNext = request.nextUrl.searchParams.get('next');
  const nextPath = safeRedirectPath(rawNext, {
    fallback: '/',
    context: 'api/auth/github/login',
  });

  const { origin } = new URL(request.url);
  const callbackUrl = `${origin}/api/auth/github/callback`;

  const githubAuthParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    state,
    scope: 'read:user user:email',
  });

  const response = NextResponse.redirect(
    `${GITHUB_AUTH_URL}?${githubAuthParams.toString()}`,
    { status: 302 }
  );

  response.cookies.set(STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: STATE_MAX_AGE_SECONDS,
    path: '/',
  });

  if (rawNext !== null) {
    response.cookies.set(NEXT_COOKIE_NAME, nextPath, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: STATE_MAX_AGE_SECONDS,
      path: '/',
    });
  }

  logger.info('GET /api/auth/github/login: redirecting to GitHub with state');

  return response;
}
