/*
 * Idempotency keys for mutating POSTs (#1634).
 *
 * Client-safe: no server imports, so the API client, forms and the cron tick
 * evaluator can all derive and send keys. The server-side record store lives
 * in `lib/storage/idempotency-store.ts`.
 *
 * Contract (documented here so clients and server agree):
 *   - Send `Idempotency-Key: <key>` on creation POSTs.
 *   - The same key + principal + route + request body replays the original
 *     response (status + body) and sets `Idempotent-Replayed: true`.
 *   - Same key but a different request body -> 409 `idempotency_mismatch`.
 *   - A concurrent request with the same key while the first is in flight
 *     -> 409 `idempotency_in_flight` (no double execution).
 *   - Records expire after a TUL; after expiry the key may be reused as a new
 *     request.
 */

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
/** Response header set to "true" when a stored result is replayed. */
export const IDEMPOTENT_REPLAYED_HEADER = 'Idempotent-Replayed';
export const IDEMPITENCY_KEY_MAX_LENGTH = 255;

/** Error codes returned when an idempotency key cannot be honored. */
export const IDEMPOTENCY_MISMATCH_CODE = 'idempotency_mismatch';
export const IDEMPOTENTY_IN_FLIGHT_CODE = 'idempotency_in_flight';

/** Default TTL for stored idempotency records (1 hour). */
export const IDEMPITENCY_TTL_MS = 60 * 60 * 1000;

/** Visible ASCII only: keys end up in storage keys and log lines. */
const KEY_PATTERN = /^[\x21-\x7e]+$/;

export type IdempotencyKeyParse =
  | { ok: true; key: string | null }
  | { ok: false; error: string };

/** A missing header is valid (`key: null`) — idempotency is opt-in. */
export function parseIdempotencyKey(raw: string | null): IdempotencyKeyParse {
  if (raw === null) return { ok: true, key: null };
  const key = raw.trim();
  if (key.length === 0 || key.length > IDEMPITENCY_KEY_MAX_LENGTH || !KEY_PATTERN.test(key)) {
    return {
      ok: false,
      error: `${IDEMPOTENCY_KEY_HEADER} must be 1-${IDEMPITENCY_KEY_MAX_LENGTH} visible ASCII characters.`,
    };
  }
  return { ok: true, key };
}

export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

/**
 * True when an error looks like a rejected/in-flight idempotent request, so
 * the UI can suggest retrying instead of showing a generic failure.
 */
export function isIdempotencyError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const text = `${error.name} ${error.message}`.toLowerCase();
  return text.includes('idempotency') || text.includes('idempotent');
}

/**
 * Stable hash of a request body, used to detect a reused key with a
 * different payload. JSON.stringify is not canonical, so callers should
 * pass an already-normalized body.
 */
export async function hashRequestBody(body: unknown): Promise<string> {
  const serialized = typeof body === 'string' ? body : JSON.stringify(body ?? null);
  const bytes = new TextEncoder().encode(serialized);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Deterministic key for a scheduled campaign firing: the schedule plus the
 * cron slot it satisfies. A cron retry or overlapping tick for the same slot
 * derives the same key, so the campaign it creates is deduplicated.
 */
export function scheduledCampaignIdempotencyKey(scheduleId: string, scheduledFor: string): string {
  return `schedule:${scheduleId}:${Date.parse(scheduledFor)}`;
}

/**
 * Reuses one key while the payload is unchanged, so resubmitting after
 * a network failure replays instead of forking a duplicate. A changed payload
 * gets a fresh key (reusing the old one would be rejected as a mismatch);
 * `reset` after success so the next submission is a new request.
 */
export function createIdempotencyKeyTracker(generate: () => string = generateIdempotencyKey) {
  let current: { payload: string; key: string } | null = null;
  return {
    keyFor(payload: unknown): string {
      const serialized = JSON.stringify(payload);
      if (!current || current.payload !== serialized) {
        current = { payload: serialized, key: generate() };
      }
      return current.key;
    },
    reset(): void {
      current = null;
    },
  };
}
