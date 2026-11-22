/**
 * Pure helpers backing {@link usePersistentFormState}.
 *
 * Fixes #840: form state was lost when the user switched browser tabs (the tab
 * gets throttled/unmounted and in-memory React state is dropped). Persisting a
 * serialisable draft to storage and rehydrating it lets the form survive that.
 * The serialise / merge / expiry logic lives here so it can be unit-tested
 * without a DOM, following the repo's tsc + node convention.
 */

/** Namespaced storage key so drafts don't collide with other app state. */
export function buildDraftStorageKey(formId: string): string {
  return `crashlab:form-draft:${formId}`;
}

interface DraftEnvelope<T> {
  /** Epoch millis when the draft was written, used for TTL expiry. */
  savedAt: number;
  value: T;
}

/** Whether a draft saved at `savedAt` has outlived `ttlMs` as of `now`. */
export function isDraftExpired(savedAt: number, ttlMs: number, now: number): boolean {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return false; // 0/∞ => never expires
  return now - savedAt > ttlMs;
}

/**
 * Shallow-merge a saved partial draft over the defaults. Only keys that exist
 * on `defaults` are kept, so stale keys from an older form version are dropped.
 */
export function mergeWithDefaults<T extends Record<string, unknown>>(
  defaults: T,
  saved: Partial<T> | null | undefined,
): T {
  if (!saved) return { ...defaults };
  const merged = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    if (Object.prototype.hasOwnProperty.call(saved, key) && saved[key] !== undefined) {
      merged[key] = saved[key] as T[keyof T];
    }
  }
  return merged;
}

/** Serialise a draft with its timestamp for storage. */
export function serializeDraft<T>(value: T, now: number): string {
  const envelope: DraftEnvelope<T> = { savedAt: now, value };
  return JSON.stringify(envelope);
}

/**
 * Parse a stored draft and merge it over the defaults. Returns the defaults
 * unchanged when the raw value is missing, malformed, or expired — so a corrupt
 * draft can never break the form.
 */
export function deserializeDraft<T extends Record<string, unknown>>(
  raw: string | null | undefined,
  defaults: T,
  ttlMs: number,
  now: number,
): T {
  if (!raw) return { ...defaults };
  try {
    const parsed = JSON.parse(raw) as DraftEnvelope<Partial<T>>;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.savedAt !== 'number') {
      return { ...defaults };
    }
    if (isDraftExpired(parsed.savedAt, ttlMs, now)) {
      return { ...defaults };
    }
    return mergeWithDefaults(defaults, parsed.value);
  } catch {
    return { ...defaults };
  }
}
