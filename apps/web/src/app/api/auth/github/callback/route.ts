import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { errorResponse } from '@/lib/api-response-utils';

const STATE_COOKIE_NAME = 'github_oauth_state';

/**
 * GET /api/auth/github/callback
 * GitHub OAuth 2.0 callback route.
 *
 * Handles the redirect from GitHub after user authorization.
 * Validates the CSRF state parameter before processing the code exchange.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const storedState = request.cookies.get(STATE_COOKIE_NAME)?.value;

  // Clear the state cookie regardless of outcome
  const clearCookie = (response: NextResponse) => {
    response.cookies.delete(STATE_COOKIE_NAME);
    return response;
  };

  if (!code) {
    return clearCookie(
      errorResponse('Missing "code" parameter from GitHub callback.', 400)
    );
  }

  // Validate the CSRF state parameter
  if (!state || !storedState) {
    logger.warn('GET /api/auth/github/callback: missing state parameter (possible CSRF)');
    return clearCookie(
      errorResponse('Missing OAuth state parameter. The login flow may have expired or been tampered with.', 403)
    );
  }

  if (state !== storedState) {
    logger.warn('GET /api/auth/github/callback: state mismatch (possible CSRF attack)');
    return clearCookie(
      errorResponse('OAuth state mismatch. The request may have been tampered with.', 403)
    );
  }

  try {
    logger.info('GET /api/auth/github/callback: exchanging code for access token', { code });

    // Simulate API latency
    await new Promise((resolve) => setTimeout(resolve, 500));

    const mockUser = {
      id: 123456,
      login: 'octocat',
      email: 'octocat@github.com',
      name: 'The Octocat',
    };

    logger.info('GET /api/auth/github/callback: authenticated user', { login: mockUser.login });

    const response = NextResponse.redirect(new URL('/', request.url), {
      status: 302,
    });

    return clearCookie(response);
  } catch (error) {
    logger.error('GET /api/auth/github/callback failed', { error });
    return clearCookie(
      errorResponse('An internal error occurred while processing the GitHub authentication.', 500)
    );
  }
}
