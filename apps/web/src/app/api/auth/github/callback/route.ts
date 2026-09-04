import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { errorResponse } from '@/lib/api-response-utils';
import { sanitizeQueryParam, sanitizeSearchParams } from '@/lib/sanitize';

const STATE_COOKIE_NAME = 'github_oauth_state';

/**
 * GET /api/auth/github/callback
 * GitHub OAuth 2.0 callback route.
 *
 * Handles the redirect from GitHub after user authorization.
 * CSRF protection: the login route generates a cryptographically random
 * `state` (crypto.randomUUID), stores it in a short-lived httpOnly,
 * sameSite=lax cookie, and includes it in the redirect to GitHub.
 * This callback verifies the returned `state` query param against the
 * cookie value and rejects mismatched or missing state with 400 to
 * prevent CSRF / login-CSRF attacks. The cookie is cleared on every
 * outcome (success or failure) to enforce single-use semantics.
 */
export async function GET(request: NextRequest) {
  const sanitizedParams = sanitizeSearchParams(new URL(request.url).searchParams);
  const rawCode = sanitizedParams.get('code');
  const rawState = sanitizedParams.get('state');
  const code = rawCode ? sanitizeQueryParam(rawCode) : null;
  const state = rawState ? sanitizeQueryParam(rawState) : null;
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
      errorResponse('Missing OAuth state parameter. The login flow may have expired or been tampered with.', 400)
    );
  }

  if (state !== storedState) {
    logger.warn('GET /api/auth/github/callback: state mismatch (possible CSRF attack)');
    return clearCookie(
      errorResponse('OAuth state mismatch. The request may have been tampered with.', 400)
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
