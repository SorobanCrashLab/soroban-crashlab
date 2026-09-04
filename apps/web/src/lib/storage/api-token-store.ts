import crypto from 'node:crypto';

export type ApiTokenScope = 'read' | 'write';

export interface ApiTokenRecord {
  id: string;
  name: string;
  sha256Hash: string;
  scope: ApiTokenScope;
  createdAt: string;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
}

export interface ApiTokenPublic {
  id: string;
  name: string;
  prefixMasked: string;
  scope: ApiTokenScope;
  createdAt: string;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
}

export type ResolveTokenResult =
  | { status: 'valid'; token: ApiTokenRecord }
  | { status: 'expired'; token: ApiTokenRecord }
  | { status: 'revoked'; token: ApiTokenRecord }
  | { status: 'invalid'; token?: undefined };

// In-memory store backing server-side storage
let tokensStore: ApiTokenRecord[] = [];

// Throttling window for lastUsedAt updates (60 seconds)
const LAST_USED_THROTTLE_MS = 60_000;

export function hashApiToken(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
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
    prefixMasked: maskTokenSecret(record.sha256Hash), // Default placeholder mask if secret not present
    scope: record.scope,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    lastUsedAt: record.lastUsedAt,
    revokedAt: record.revokedAt,
  };
}

export function createApiToken(params: {
  name: string;
  scope: ApiTokenScope;
  expiresAt?: string | null;
}): { secret: string; token: ApiTokenPublic } {
  const secretBytes = crypto.randomBytes(24).toString('hex');
  const secret = `scl_live_${secretBytes}`;
  const sha256Hash = hashApiToken(secret);
  const id = `tok_${crypto.randomBytes(8).toString('hex')}`;
  const createdAt = new Date().toISOString();

  const record: ApiTokenRecord = {
    id,
    name: params.name.trim(),
    sha256Hash,
    scope: params.scope,
    createdAt,
    expiresAt: params.expiresAt || null,
    lastUsedAt: null,
    revokedAt: null,
  };

  tokensStore.push(record);

  const publicRecord: ApiTokenPublic = {
    id: record.id,
    name: record.name,
    prefixMasked: maskTokenSecret(secret),
    scope: record.scope,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    lastUsedAt: record.lastUsedAt,
    revokedAt: record.revokedAt,
  };

  return { secret, token: publicRecord };
}

export function listApiTokens(): ApiTokenPublic[] {
  return tokensStore.map((record) => ({
    id: record.id,
    name: record.name,
    prefixMasked: `scl_live_...${record.sha256Hash.slice(-4)}`,
    scope: record.scope,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    lastUsedAt: record.lastUsedAt,
    revokedAt: record.revokedAt,
  }));
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
  const record = tokensStore.find((t) => t.sha256Hash === hash);
  if (!record) {
    return { status: 'invalid' };
  }

  if (record.revokedAt) {
    return { status: 'revoked', token: record };
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
