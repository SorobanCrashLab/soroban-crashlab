/**
 * GitHub session cookie for identity-bound RBAC (#1548).
 *
 * A role has to hang off something a caller cannot simply declare. For browser
 * sessions that something is the GitHub OAuth login: this module mints and
 * verifies a signed cookie carrying the GitHub login, and `rbac.ts` turns that
 * login into a `github:<login>` principal whose role comes from the role store.
 *
 * The cookie is `<base64url(login)>.<base64url(HMAC-SHA256)>` over the login
 * with a server secret. It is not a bearer credential and is not readable as a
 * role: a tampered or unsigned cookie verifies to `null`, which resolves to the
 * anonymous principal and therefore the lowest role.
 *
 * Web Crypto only, no `node:crypto`, so this is safe to reach from the Edge
 * middleware graph.
 */

export const GITHUB_SESSION_COOKIE = 'crashlab_github_session';

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/**
 * The signing secret. Absent means sessions cannot be issued or trusted, which
 * is the correct posture for a deployment that has not opted in: RBAC then
 * falls back to API tokens and to the anonymous least-privilege role.
 */
export function getGitHubSessionSecret(): string | undefined {
  const secret = process.env.CRASHLAB_GITHUB_SESSION_SECRET;
  return secret && secret.trim().length > 0 ? secret.trim() : undefined;
}

export function getGitHubSessionMaxAgeSeconds(): number {
  const raw = process.env.CRASHLAB_GITHUB_SESSION_TTL_SECONDS;
  if (!raw) return SESSION_MAX_AGE_SECONDS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : SESSION_MAX_AGE_SECONDS;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Compares two hex digests without short-circuiting on the first difference,
 * so a mismatching signature does not leak its prefix length by timing.
 */
export function constantTimeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Mints a signed session value for a GitHub login.
 * Returns `null` when no signing secret is configured.
 */
export async function issueGitHubSession(login: string): Promise<string | null> {
  const secret = getGitHubSessionSecret();
  if (!secret) return null;

  const normalised = login.trim().toLowerCase();
  if (normalised.length === 0) return null;

  const payload = base64UrlEncode(new TextEncoder().encode(normalised));
  const signature = await hmacHex(secret, payload);
  return `${payload}.${signature}`;
}

/**
 * Verifies a session value and returns the GitHub login it names.
 * Returns `null` for absent, malformed, unsigned or tampered values.
 */
export async function verifyGitHubSession(raw: string | null | undefined): Promise<string | null> {
  const secret = getGitHubSessionSecret();
  if (!secret || !raw) return null;

  const separator = raw.lastIndexOf('.');
  if (separator <= 0 || separator === raw.length - 1) return null;

  const payload = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);

  const expected = await hmacHex(secret, payload);
  if (!constantTimeHexEqual(expected, signature)) return null;

  try {
    const login = new TextDecoder().decode(base64UrlDecode(payload)).trim();
    return login.length > 0 ? login : null;
  } catch {
    return null;
  }
}
