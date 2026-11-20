/**
 * Auth validation for SSE connections (#2191).
 *
 * EventSource does not support custom headers, so authentication for SSE
 * connections must use either cookies (withCredentials) or a query param
 * token. This module validates the request and returns the principal.
 */

import { type NextRequest, cookies } from 'next/headers';
import {
  ANONYMOUS_PRINCIPAL,
  type RbacPrincipal,
} from '@/lib/rbac';

/**
 * Validate the SSE request and return the authenticated principal.
 *
 * Falls back gracefully to the anonymous principal when no auth is configured
 * (e.g. in local development). Production deployments should configure
 * session cookies or API tokens.
 */
export async function validateStreamAuth(
  request: NextRequest,
): Promise<{ authenticated: boolean; principal: RbacPrincipal }> {
  // Try cookie-based auth (EventSource supports withCredentials).
  // In production, this would call resolvePrincipal(request).
  // For the mock, we check for a session cookie.
  const cookieHeader = request.headers.get('cookie') ?? '';
  if (cookieHeader.includes('crashlab-session') || cookieHeader.includes('github-session')) {
    return {
      authenticated: true,
      principal: {
        identityType: 'github',
        identityValue: 'session-user',
        subject: 'github:session-user',
        authenticated: true,
      },
    };
  }

  // Try query param token (fallback for clients that can't set cookies).
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (token && token.length > 0) {
    return {
      authenticated: true,
      principal: {
        identityType: 'api-key',
        identityValue: token,
        subject: `api-key:${token}`,
        authenticated: true,
      },
    };
  }

  // Unauthenticated — still allow read-only SSE in development.
  return { authenticated: false, principal: ANONYMOUS_PRINCIPAL };
}
