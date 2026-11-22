/**
 * GitHub browser sessions. The cookie is an HMAC-signed opaque identifier;
 * identity and revocation state are held in the shared record store.
 */

import {
  invalidateServerSession,
  issueServerSession,
  SESSION_ABSOLUTE_TIMEOUT_MS,
  verifyServerSession,
} from './auth/server-session';

export const GITHUB_SESSION_COOKIE =
  process.env.NODE_ENV === 'production' ? '__Host-crashlab_github_session' : 'crashlab_github_session';

export function getGitHubSessionSecret(): string | undefined {
  const secret = process.env.CRASHLAB_GITHUB_SESSION_SECRET;
  return secret && secret.trim().length > 0 ? secret.trim() : undefined;
}

/** Legacy TTL tuning is capped by the non-configurable 12-hour absolute limit. */
export function getGitHubSessionMaxAgeSeconds(): number {
  const raw = process.env.CRASHLAB_GITHUB_SESSION_TTL_SECONDS;
  if (!raw) return SESSION_ABSOLUTE_TIMEOUT_MS / 1000;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(parsed, SESSION_ABSOLUTE_TIMEOUT_MS / 1000)
    : SESSION_ABSOLUTE_TIMEOUT_MS / 1000;
}

export function constantTimeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function issueGitHubSession(
  login: string,
  existingCookie?: string | null,
  nowMs = Date.now(),
  userAgent = '',
): Promise<string | null> {
  return issueServerSession('github', login, getGitHubSessionSecret(), existingCookie, nowMs, userAgent);
}

export async function verifyGitHubSession(
  raw: string | null | undefined,
  nowMs = Date.now(),
  userAgent = '',
): Promise<string | null> {
  return verifyServerSession('github', raw, getGitHubSessionSecret(), nowMs, userAgent);
}

export async function invalidateGitHubSession(raw: string | null | undefined): Promise<boolean> {
  return invalidateServerSession('github', raw, getGitHubSessionSecret());
}
