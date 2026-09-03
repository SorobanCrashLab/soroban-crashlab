import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { errorResponse } from '@/lib/api-response-utils';

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const STATE_COOKIE_NAME = 'github_oauth_state';
const STATE_MAX_AGE_SECONDS = 600;

/**
 * GET /api/auth/github/login
 * Initiates the GitHub OAuth 2.0 flow.
 *
 * Generates a cryptographically random state parameter, stores it in a
 * short-lived httpOnly cookie, and redirects the user to GitHub's
 * authorization endpoint.
 */
export async function GET(request: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID;

  if (!clientId) {
    logger.warn('GET /api/auth/github/login: GITHUB_CLIENT_ID is not configured');
    return errorResponse('GitHub OAuth is not configured.', 503);
  }

  const state = crypto.randomUUID();

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

  logger.info('GET /api/auth/github/login: redirecting to GitHub with state');

  return response;
}
