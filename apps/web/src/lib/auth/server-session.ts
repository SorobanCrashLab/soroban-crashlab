/**
 * Server-backed browser sessions. Cookies contain only a random identifier
 * and its HMAC; identity and lifetime state remain in the durable record store.
 */

import { isRedisConfigured } from '@/lib/redis';
import { selectRecordDriver } from '@/lib/storage/record-driver';

export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const SESSION_ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000;
const SESSION_ABSOLUTE_TIMEOUT_SECONDS = SESSION_ABSOLUTE_TIMEOUT_MS / 1000;

export type ServerSessionProvider = 'github' | 'oidc';

export class DurableSessionStorageError extends Error {
  constructor() {
    super('Durable session storage is unavailable.');
    this.name = 'DurableSessionStorageError';
  }
}

interface SessionRecord {
  version: 1;
  provider: ServerSessionProvider;
  identity: string;
  userAgentHash: string;
  createdAt: number;
  lastActivityAt: number;
}

function recordKey(id: string): Promise<string> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(id)).then((digest) => {
    return `auth:session:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  });
}

function encode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decode(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '='));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmac(secret: string, provider: ServerSessionProvider, id: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${provider}:${id}`));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hashUserAgent(secret: string, userAgent: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`crashlab:session:user-agent:v1:${userAgent}`),
  );
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function signaturesEqual(a: string, b: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(a) || a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

function recordDriver() {
  // The ordinary record selector intentionally falls back to memory for
  // development. Sessions must not: that would make invalidation instance-local.
  if (process.env.NODE_ENV !== 'test' && !isRedisConfigured()) {
    throw new DurableSessionStorageError();
  }
  const driver = selectRecordDriver();
  if (process.env.NODE_ENV !== 'test' && driver.name !== 'upstash-records') {
    throw new DurableSessionStorageError();
  }
  return driver;
}

async function parseCookie(
  raw: string | null | undefined,
  secret: string | undefined,
  provider: ServerSessionProvider,
): Promise<string | null> {
  if (!secret || !raw) return null;
  const separator = raw.lastIndexOf('.');
  if (separator <= 0) return null;
  const id = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);
  const decodedId = decode(id);
  if (
    !decodedId ||
    decodedId.byteLength !== 32 ||
    !signaturesEqual(await hmac(secret, provider, id), signature)
  ) return null;
  return id;
}

function parseRecord(raw: string | null): SessionRecord | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const record = value as Partial<SessionRecord>;
    if (
      record.version !== 1 ||
      (record.provider !== 'github' && record.provider !== 'oidc') ||
      typeof record.identity !== 'string' ||
      !record.identity ||
      typeof record.userAgentHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(record.userAgentHash) ||
      typeof record.createdAt !== 'number' ||
      !Number.isFinite(record.createdAt) ||
      typeof record.lastActivityAt !== 'number' ||
      !Number.isFinite(record.lastActivityAt)
    ) return null;
    return record as SessionRecord;
  } catch {
    return null;
  }
}

export async function issueServerSession(
  provider: ServerSessionProvider,
  identity: string,
  secret: string | undefined,
  existingCookie?: string | null,
  nowMs = Date.now(),
  userAgent = '',
): Promise<string | null> {
  const normalised = identity.trim();
  if (!secret || !normalised) return null;

  try {
    const driver = recordDriver();
    const previousId = await parseCookie(existingCookie, secret, provider);
    if (previousId) await driver.deleteRecord(await recordKey(previousId));

    const random = new Uint8Array(32);
    crypto.getRandomValues(random);
    const id = encode(random);
    const record: SessionRecord = {
      version: 1,
      provider,
      identity: provider === 'github' ? normalised.toLowerCase() : normalised,
      userAgentHash: await hashUserAgent(secret, userAgent),
      createdAt: nowMs,
      lastActivityAt: nowMs,
    };
    await driver.putRecord(
      await recordKey(id),
      JSON.stringify(record),
      SESSION_ABSOLUTE_TIMEOUT_SECONDS,
    );
    return `${id}.${await hmac(secret, provider, id)}`;
  } catch {
    throw new DurableSessionStorageError();
  }
}

export async function verifyServerSession(
  provider: ServerSessionProvider,
  raw: string | null | undefined,
  secret: string | undefined,
  nowMs = Date.now(),
  userAgent = '',
): Promise<string | null> {
  if (!raw || !secret) return null;
  try {
    const id = await parseCookie(raw, secret, provider);
    if (!id) return null;
    const driver = recordDriver();
    const key = await recordKey(id);
    const record = parseRecord(await driver.getRecord(key));
    if (!record || record.provider !== provider) return null;
    const presentedUserAgentHash = await hashUserAgent(secret, userAgent);
    if (!signaturesEqual(record.userAgentHash, presentedUserAgentHash)) return null;
    if (
      record.createdAt > nowMs ||
      record.lastActivityAt > nowMs ||
      nowMs - record.createdAt >= SESSION_ABSOLUTE_TIMEOUT_MS ||
      nowMs - record.lastActivityAt >= SESSION_IDLE_TIMEOUT_MS
    ) {
      await driver.deleteRecord(key);
      return null;
    }
    record.lastActivityAt = nowMs;
    const remainingSeconds = Math.ceil(
      (record.createdAt + SESSION_ABSOLUTE_TIMEOUT_MS - nowMs) / 1000,
    );
    const updated = await driver.updateRecordIfPresent(key, JSON.stringify(record), remainingSeconds);
    if (!updated) return null;
    return record.identity;
  } catch {
    // Storage errors never fall back to a process-local session or grant access.
    return null;
  }
}

export async function invalidateServerSession(
  provider: ServerSessionProvider,
  raw: string | null | undefined,
  secret: string | undefined,
): Promise<boolean> {
  if (!raw) return false;
  if (!secret) throw new DurableSessionStorageError();
  const id = await parseCookie(raw, secret, provider);
  if (!id) return false;
  return recordDriver().deleteRecord(await recordKey(id));
}
