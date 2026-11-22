import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-response-utils';
import { GITHUB_SESSION_COOKIE, invalidateGitHubSession } from '@/lib/github-session';
import {
  invalidateOidcSession,
  OIDC_SESSION_COOKIE,
} from '@/lib/auth/oidc-session';

function clearSessionCookies(response: NextResponse): NextResponse {
  const secure = process.env.NODE_ENV === 'production';
  const names = new Set([
    GITHUB_SESSION_COOKIE,
    OIDC_SESSION_COOKIE,
    'crashlab_github_session',
    'crashlab_oidc_session',
  ]);
  for (const name of names) {
    response.cookies.set(name, '', {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

/** POST /api/auth/logout: revoke the presented server-side session. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const githubCookie = request.cookies.get(GITHUB_SESSION_COOKIE)?.value;
  const oidcCookie = request.cookies.get(OIDC_SESSION_COOKIE)?.value;

  try {
    const results = await Promise.allSettled([
      invalidateGitHubSession(githubCookie),
      invalidateOidcSession(oidcCookie),
    ]);
    const failed = results.some((result) => result.status === 'rejected');
    const response = failed
      ? errorResponse('Session storage is unavailable; logout could not be confirmed.', 503)
      : NextResponse.json({ ok: true });
    return clearSessionCookies(response);
  } catch {
    return clearSessionCookies(
      errorResponse('Session storage is unavailable; logout could not be confirmed.', 503),
    );
  }
}
