/**
 * Idempotency keys for mutating POSTs (#1634).
 *
 * Client-safe: no server imports, so the API client, forms and the cron tick
 * evaluator can all derive and send keys. The server-side record store lives
 * in `lib/storage/idempotency-store.ts`.
 */

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
/** Response header set to "true" when a stored result is replayed. */
export const IDEMPOTENT_REPLAYED_HEADER = 'Idempotent-Replayed';
export const IDEMPOTENCY_KEY_MAX_LENGTH = 255;

/** Visible ASCII only: keys end up in storage keys and log lines. */
const KEY_PATTERN = /^[\x21-\x7e]+$/;

export type IdempotencyKeyParse =
  | { ok: true; key: string | null }
  | { ok: false; error: string };

/** A missing header is valid (`key: null`) — idempotency is opt-in. */
export function parseIdempotencyKey(raw: string | null): IdempotencyKeyParse {
  if (raw === null) return { ok: true, key: null };
  const key = raw.trim();
  if (key.length === 0 || key.length > IDEMPOTENCY_KEY_MAX_LENGTH || !KEY_PATTERN.test(key)) {
    return {
      ok: false,
      error: `${IDEMPOTENCY_KEY_HEADER} must be 1-${IDEMPOTENCY_KEY_MAX_LENGTH} visible ASCII characters.`,
    };
  }
  return { ok: true, key };
}

export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
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
 * Reuses one key while the payload is unchanged, so resubmitting after a
 * network failure replays instead of forking a duplicate. A changed payload
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
