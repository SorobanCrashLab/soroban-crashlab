import crypto from 'node:crypto';

export type ApiTokenScope = 'webhook:read' | 'webhook:write' | 'runs:read' | 'runs:write' | 'settings:read' | 'settings:write' | '*';

/** Default lifetime (90 days) applied when no explicit expiry is supplied. */
export const DEFAULT_TOKEN_TTL_MS =
  (parseInt(process.env.CRASHLAB_API_TOKEN_TTL_DAYS || '90', 10) || 90) * 24 * 60 * 60 * 1000;

/** Rotated tokens stay valid for this overlap window, then are revoked. */
export const TOKEN_ROTATION_GRACE_MS =
  (parseInt(process.env.CRASHLAB_API_TOKEN_ROTATION_GRACE_HOURS || '24', 10) || 24) * 60 * 60 * 1000;

export interface ApiTokenRecord {
  id: string;
  name: string;
  sha256Hash: string;
  scopes: ApiTokenScope[];
  createdAt: string;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  rotatedAt?: string | null;
}

export interface ApiTokenPublic {
  id: string;
  name: string;
  prefixMasked: string;
  scopes: ApiTokenScope[];
  createdAt: string;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  rotatedAt?: string | null;
}

export type ResolveTokenResult =
  | { status: 'valid'; token: ApiTokenRecord }
  | { status: 'expired'; token: ApiTokenRecord }
  | { status: 'revoked'; token: ApiTokenRecord }
  | { status: 'invalid'; token?: undefined };

/** Result of rotating a token: the new secret plus the successor record. */
export interface RotateTokenResult {
  secret: string;
  token: ApiTokenPublic;
  previousTokenId: string;
}

// In-memory store backing server-side storage
let tokensStore: ApiTokenRecord[] = [];

// Throttling window for lastUsedAt updates (60 seconds)
const LAST_USED_THROTTLE_MS = 60_000;

export function hashApiToken(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

/**
 * Constant-time equality over two opaque strings using padding so length
 * differences do not short-circuit the comparison. Used when matching a
 * presented secret's hash against stored hashes.
 */
export function timingSafeHashEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  const maxLen = Math.max(bufA.length, bufB.length);
  const paddedA = Buffer.alloc(maxLen, 0);
  const paddedB = Buffer.alloc(maxLen, 0);
  bufA.copy(paddedA);
  bufB.copy(paddedB);
  return crypto.timingSafeEqual(paddedA, paddedB) && bufA.length === bufB.length;
}

export function maskTokenSecret(secret: string): string {
  if (secret.length <= 12) {
    return `${secret.slice(0, 4)}...`;
  }
  return `${secret.slice(0, 8)}...${secret.slice(-4)}`;
}

export function toPublicRecord(record: ApiTokenRecord): ApiTokenPublic {
  return {
    id: record.id,
    name: record.name,
    prefixMasked: maskTokenSecret(record.sha256Hash),
    scopes: record.scopes,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    lastUsedAt: record.lastUsedAt,
    revokedAt: record.revokedAt,
    rotatedAt: record.rotatedAt ?? null,
  };
}

export function createApiToken(params: {
  name: string;
  scopes: ApiTokenScope[];
  expiresAt?: string | null;
  nowMs?: number;
}): { secret: string; token: ApiTokenPublic } {
  const secretBytes = crypto.randomBytes(24).toString('hex');
  const secret = `scl_live_${secretBytes}`;
  const sha256Hash = hashApiToken(secret);
  const id = `tok_${crypto.randomBytes(8).toString('hex')}`;
  const nowMs = params.nowMs ?? Date.now();
  const createdAt = new Date(nowMs).toISOString();

  const expiresAt = params.expiresAt ?? new Date(nowMs + DEFAULT_TOKEN_TTL_MS).toISOString();

  const record: ApiTokenRecord = {
    id,
    name: params.name.trim(),
    sha256Hash,
    scopes: params.scopes,
    createdAt,
    expiresAt,
    lastUsedAt: null,
    revokedAt: null,
    rotatedAt: null,
  };

  tokensStore.push(record);

  const publicRecord: ApiTokenPublic = {
    id: record.id,
    name: record.name,
    prefixMasked: maskTokenSecret(secret),
    scopes: record.scopes,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    lastUsedAt: record.lastUsedAt,
    revokedAt: record.revokedAt,
    rotatedAt: record.rotatedAt ?? null,
  };

  return { secret, token: publicRecord };
}

export function listApiTokens(): ApiTokenPublic[] {
  return tokensStore.map((record) => ({
    id: record.id,
    name: record.name,
    prefixMasked: `scl_live_...${record.sha256Hash.slice(-4)}`,
    scopes: record.scopes,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    lastUsedAt: record.lastUsedAt,
    revokedAt: record.revokedAt,
    rotatedAt: record.rotatedAt ?? null,
  }));
}

/**
 * Rotates a token: mints a successor with a fresh secret (same name/scope),
 * marks the old one as rotated, and keeps the old token valid for a grace
 * overlap window so in-flight consumers can migrate without downtime.
 *
 * Returns the new secret + record, or undefined when the id is unknown.
 */
export function rotateApiToken(id: string, nowMs = Date.now()): RotateTokenResult | undefined {
  const existing = tokensStore.find((t) => t.id === id);
  if (!existing) {
    return undefined;
  }

  const { secret, token } = createApiToken({
    name: existing.name,
    scopes: existing.scopes,
    nowMs,
  });

  existing.rotatedAt = new Date(nowMs).toISOString();

  return { secret, token, previousTokenId: existing.id };
}

export function revokeApiToken(id: string): boolean {
  const token = tokensStore.find((t) => t.id === id);
  if (!token) return false;
  if (!token.revokedAt) {
    token.revokedAt = new Date().toISOString();
  }
  return true;
}

export function resolveApiToken(secret: string, nowMs = Date.now()): ResolveTokenResult {
  const hash = hashApiToken(secret);
  const record = tokensStore.find((t) => timingSafeHashEqual(t.sha256Hash, hash));
  if (!record) {
    return { status: 'invalid' };
  }

  if (record.revokedAt) {
    return { status: 'revoked', token: record };
  }

  // A rotated token is revoked once its grace overlap window has elapsed.
  if (record.rotatedAt) {
    const graceDeadline = new Date(record.rotatedAt).getTime() + TOKEN_ROTATION_GRACE_MS;
    if (nowMs > graceDeadline) {
      return { status: 'revoked', token: record };
    }
  }

  if (record.expiresAt) {
    const expiresMs = new Date(record.expiresAt).getTime();
    if (expiresMs <= nowMs) {
      return { status: 'expired', token: record };
    }
  }

  // Update lastUsedAt with write throttling
  const lastUsedMs = record.lastUsedAt ? new Date(record.lastUsedAt).getTime() : 0;
  if (nowMs - lastUsedMs >= LAST_USED_THROTTLE_MS) {
    record.lastUsedAt = new Date(nowMs).toISOString();
  }

  return { status: 'valid', token: record };
}

export function resetApiTokenStore(): void {
  tokensStore = [];
}
