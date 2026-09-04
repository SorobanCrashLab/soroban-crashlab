/**
 * lib/local-storage — typed localStorage gateway with namespaced keys and SSR guards.
 *
 * Usage:
 *   const themeStore = defineStorage('crashlab:dark-mode', {
 *     parse: (raw) => raw === 'true',
 *     serialize: (v) => String(v),
 *   });
 *   themeStore.get();       // boolean | null
 *   themeStore.set(true);
 *   themeStore.remove();
 *
 * Guarantees:
 *   - SSR-safe: all reads/writes are no-ops on the server.
 *   - Quota/private-mode errors flow through a consistent logger-based handler.
 *   - Duplicate key registrations throw at definition time (collision guard).
 *   - Zero runtime dependencies (~60 LOC core).
 */

// ── Key registry ──────────────────────────────────────────────────────────────

/** Every key registered via defineStorage — used for collision detection. */
export const REGISTERED_KEYS = new Set<string>();

// ── Error channel ─────────────────────────────────────────────────────────────

let _onError: (key: string, error: unknown) => void = (key, error) => {
  console.warn(`[storage] error for key "${key}":`, error);
};

/** Override the error handler (useful in tests / storybook). */
export function setStorageErrorHandler(
  handler: (key: string, error: unknown) => void,
): void {
  _onError = handler;
}

// ── Core types ────────────────────────────────────────────────────────────────

export interface StorageOptions<T> {
  /** Convert the raw string from localStorage to T. Return null for unreadable values. */
  parse: (raw: string) => T | null;
  /** Convert T to the string stored in localStorage. */
  serialize: (value: T) => string;
}

export interface StorageEntry<T> {
  readonly key: string;
  /** Read the stored value; returns null when absent or on error. */
  get(): T | null;
  /** Write a value; silently handles quota / private-mode errors. */
  set(value: T): void;
  /** Delete the entry from localStorage. */
  remove(): void;
}

// ── SSR guard ─────────────────────────────────────────────────────────────────

function isClient(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

// ── defineStorage ─────────────────────────────────────────────────────────────

/**
 * Register a typed localStorage entry.
 * @throws {Error} if the same key is registered more than once.
 */
export function defineStorage<T>(
  key: string,
  options: StorageOptions<T>,
): StorageEntry<T> {
  if (REGISTERED_KEYS.has(key)) {
    throw new Error(
      `[storage] duplicate key registration: "${key}". Each key must be registered once.`,
    );
  }
  REGISTERED_KEYS.add(key);

  return {
    key,
    get(): T | null {
      if (!isClient()) return null;
      try {
        const raw = window.localStorage.getItem(key);
        if (raw === null) return null;
        return options.parse(raw);
      } catch (err) {
        _onError(key, err);
        return null;
      }
    },
    set(value: T): void {
      if (!isClient()) return;
      try {
        window.localStorage.setItem(key, options.serialize(value));
      } catch (err) {
        _onError(key, err);
      }
    },
    remove(): void {
      if (!isClient()) return;
      try {
        window.localStorage.removeItem(key);
      } catch (err) {
        _onError(key, err);
      }
    },
  };
}

// ── Built-in helpers ──────────────────────────────────────────────────────────

/** boolean ("true" / "false") */
export function defineBooleanStorage(key: string): StorageEntry<boolean> {
  return defineStorage<boolean>(key, {
    parse: (raw) => raw === 'true',
    serialize: (v) => String(v),
  });
}

/** JSON-serialised value — returns null on parse failure */
export function defineJsonStorage<T>(key: string): StorageEntry<T> {
  return defineStorage<T>(key, {
    parse: (raw) => {
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    serialize: (v) => JSON.stringify(v),
  });
}

/** Raw string passthrough */
export function defineStringStorage(key: string): StorageEntry<string> {
  return defineStorage<string>(key, {
    parse: (raw) => raw,
    serialize: (v) => v,
  });
}
