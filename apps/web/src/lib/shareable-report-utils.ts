// apps/web/src/lib/shareable-report-utils.ts
//
// Signed shareable-report tokens. The token carries the resource id, issued-at
// timestamp and expiry, all HMAC-SHA256 signed with a server-held secret. A
// client can never forge an extension because it cannot compute the signature.
// Clock-skew tolerance is applied ONLY to issued-at freshness so a legitimate
// token is never rejected for a small requester-clock difference; expiry is
// absolute and is never extended by skew.

import crypto from "crypto";

/**
 * Environment variable that provisions the signing secret in production.
 * Deployment must set this; mock/dev mode falls back to a clearly-flagged
 * non-production secret.
 */
export const SHAREABLE_SECRET_ENV = "NAVY_SHAREABLE_SECRET";

/** Non-production fallback secret. Marked clearly so it is never used for real auth. */
export const DEV_SHAREABLE_SECRET = "dev-only-shareable-secret";

/** Default lifetime of a share link. */
export const DEFAULT_SHAREABLE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Clock-skew allowance applied to issued-at freshness only. */
export const DEFAULT_CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface ShareableTokenInfo {
  runId: string;
  issuedAt: number;
  expiresAt: number;
}

function resolveSecret(): { secret: string; usingDevSecret: boolean } {
  const configured = process.env[SHAREABLE_SECRET_ENV];
  if (configured) {
    return { secret: configured, usingDevSecret: false };
  }
  return { secret: DEV_SHAREABLE_SECRET, usingDevSecret: true };
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/**
 * Generate a signed token containing the run ID, issued-at and expiration
 * timestamp. Token is base64url-encoded JSON: { runId, iat, exp, sig }.
 */
export function generateShareableToken(
  runId: string,
  ttlMs: number = DEFAULT_SHAREABLE_TTL_MS,
  now: number = Date.now(),
  secret: string = resolveSecret().secret,
): string {
  const iat = now;
  const exp = now + ttlMs;
  const unsigned = `${runId}:${iat}:${exp}`;
  const sig = sign(unsigned, secret);
  const payload = { runId, iat, exp, sig };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export interface VerifyShareableTokenOptions {
  /** Server-provided current time. Defaults to the server clock, never the requester's. */
  now?: number;
  /** Clock-skew allowance for issued-at freshness; does NOT extend expiry. */
  clockSkewMs?: number;
  secret?: string;
}

/**
 * Verify the token and return the runId if valid, otherwise null.
 * Expiry is validated against the (server) `now`; a token whose signature does
 * not verify — including any tampering of expiry, id, or signature — or that
 * has expired is rejected. Unsigned/legacy links fail verification and return
 * null, which callers surface via a graceful "link no longer valid" page.
 */
export function verifyShareableToken(
  token: string,
  options?: VerifyShareableTokenOptions,
): string | null {
  const now = options?.now ?? Date.now();
  const clockSkewMs = options?.clockSkewMs ?? DEFAULT_CLOCK_SKEW_MS;
  const secret = options?.secret ?? resolveSecret().secret;

  let decoded: {
    runId?: string;
    iat?: number;
    exp?: number;
    sig?: string;
  };
  try {
    decoded = JSON.parse(Buffer.from(token, "base64url").toString()) as NonNullable<typeof decoded>;
  } catch {
    return null;
  }

  const { runId, iat, exp, sig } = decoded;
  if (
    typeof runId !== "string" ||
    typeof iat !== "number" ||
    typeof exp !== "number" ||
    typeof sig !== "string"
  ) {
    return null;
  }

  // Signature must verify BEFORE any time check so tampering is always rejected.
  const expectedSig = sign(`${runId}:${iat}:${exp}`, secret);
  if (!safeEqual(expectedSig, sig)) return null;

  // Expiry is absolute and never extended by clock skew.
  if (now > exp) return null;

  // Issued-at freshness: within skew tolerance only.
  if (iat > now + clockSkewMs) return null;

  return runId;
}

/**
 * Decode the unverified metadata of a token for display (e.g. expiry notice).
 * Returns null for malformed/legacy tokens.
 */
export function decodeShareableTokenInfo(token: string): ShareableTokenInfo | null {
  try {
    const { runId, iat, exp } = JSON.parse(
      Buffer.from(token, "base64url").toString(),
    ) as { runId?: string; iat?: number; exp?: number };
    if (typeof runId !== "string" || typeof iat !== "number" || typeof exp !== "number") {
      return null;
    }
    return { runId, issuedAt: iat, expiresAt: exp };
  } catch {
    return null;
  }
}
