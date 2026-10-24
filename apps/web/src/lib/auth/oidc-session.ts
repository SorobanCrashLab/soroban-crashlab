/**
 * OIDC browser sessions use the same shared, opaque server-side session
 * records as GitHub sessions while retaining an independent signing secret.
 */

import {
  invalidateServerSession,
  issueServerSession,
  SESSION_ABSOLUTE_TIMEOUT_MS,
  verifyServerSession,
} from './server-session';

export const OIDC_SESSION_COOKIE =
  process.env.NODE_ENV === 'production' ? '__Host-crashlab_oidc_session' : 'crashlab_oidc_session';
export const OIDC_SESSION_MAX_AGE_SECONDS = SESSION_ABSOLUTE_TIMEOUT_MS / 1000;

export function getOidcSessionSecret(): string | undefined {
  const secret = process.env.CRASHLAB_OIDC_SESSION_SECRET?.trim();
  return secret ? secret : undefined;
}

export async function issueOidcSession(
  identity: string,
  nowMs = Date.now(),
  existingCookie?: string | null,
  userAgent = '',
): Promise<string | null> {
  return issueServerSession('oidc', identity, getOidcSessionSecret(), existingCookie, nowMs, userAgent);
}

export async function verifyOidcSession(
  raw: string | null | undefined,
  nowMs = Date.now(),
  userAgent = '',
): Promise<string | null> {
  return verifyServerSession('oidc', raw, getOidcSessionSecret(), nowMs, userAgent);
}

export async function invalidateOidcSession(raw: string | null | undefined): Promise<boolean> {
  return invalidateServerSession('oidc', raw, getOidcSessionSecret());
}
