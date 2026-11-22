/**
 * Guarded browser storage gateway.
 *
 * All application persistence should go through this module. It keeps the
 * existing key names intact while making browser storage optional, SSR-safe,
 * quota-safe, and observable across tabs.
 */

export type StorageArea = 'local' | 'session';

export const REGISTERED_KEYS = new Set<string>();

let onError: (key: string, error: unknown) => void = (key, error) => {
  console.warn(`[storage] error for key "${key}":`, error);
};

export function setStorageErrorHandler(
  handler: (key: string, error: unknown) => void,
): void {
  onError = handler;
}

export interface StorageOptions<T> {
  parse: (raw: string) => T | null;
  serialize: (value: T) => string;
}

export type StorageListener<T> = (value: T | null) => void;

export interface StorageEntry<T> {
  readonly key: string;
  get(): T | null;
  set(value: T): void;
  remove(): void;
  subscribe(listener: StorageListener<T>): () => void;
}

const memoryFallback: Record<StorageArea, Map<string, string>> = {
  local: new Map(),
  session: new Map(),
};

const subscriptions = new Map<string, Set<(value: string | null) => void>>();

function subscriptionKey(area: StorageArea, key: string): string {
  return `${area}:${key}`;
}

function storageBackend(area: StorageArea, key: string): Storage | null {
  try {
    if (typeof window !== 'undefined') {
      const browserStorage = area === 'session' ? window.sessionStorage : window.localStorage;
      if (browserStorage) return browserStorage;
    }
    if (typeof globalThis !== 'undefined') {
      return area === 'session' ? globalThis.sessionStorage : globalThis.localStorage;
    }
  } catch (error) {
    onError(key, error);
  }
  return null;
}

function notify(area: StorageArea, key: string, value: string | null): void {
  const listeners = subscriptions.get(subscriptionKey(area, key));
  if (!listeners) return;
  for (const listener of listeners) listener(value);
}

function readRaw(area: StorageArea, key: string): string | null {
  const backend = storageBackend(area, key);
  if (backend) {
    try {
      const value = backend.getItem(key);
      if (value !== null) {
        memoryFallback[area].delete(key);
        return value;
      }
    } catch (error) {
      onError(key, error);
    }
  }

  return memoryFallback[area].get(key) ?? null;
}

function writeRaw(area: StorageArea, key: string, value: string): boolean {
  const backend = storageBackend(area, key);
  if (backend) {
    try {
      backend.setItem(key, value);
      memoryFallback[area].delete(key);
      notify(area, key, value);
      return true;
    } catch (error) {
      onError(key, error);
    }
  }

  memoryFallback[area].set(key, value);
  notify(area, key, value);
  return false;
}

function removeRaw(area: StorageArea, key: string): void {
  const backend = storageBackend(area, key);
  if (backend) {
    try {
      backend.removeItem(key);
    } catch (error) {
      onError(key, error);
    }
  }
  memoryFallback[area].delete(key);
  notify(area, key, null);
}

function subscribeRaw(
  area: StorageArea,
  key: string,
  listener: (value: string | null) => void,
): () => void {
  const keyWithArea = subscriptionKey(area, key);
  const listeners = subscriptions.get(keyWithArea) ?? new Set();
  listeners.add(listener);
  subscriptions.set(keyWithArea, listeners);

  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== key) return;
    if (event.storageArea && event.storageArea !== storageBackend(area, key)) return;
    listener(event.key === null ? null : event.newValue);
  };

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', onStorage);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) subscriptions.delete(keyWithArea);
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('storage', onStorage);
    }
  };
}

/** Exact-key access for code that cannot declare a registered entry. */
export const safeStorage = {
  getItem(key: string, area: StorageArea = 'local'): string | null {
    return readRaw(area, key);
  },
  setItem(key: string, value: string, area: StorageArea = 'local'): boolean {
    return writeRaw(area, key, value);
  },
  removeItem(key: string, area: StorageArea = 'local'): void {
    removeRaw(area, key);
  },
  getJson<T>(key: string, area: StorageArea = 'local'): T | null {
    const raw = readRaw(area, key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  setJson(key: string, value: unknown, area: StorageArea = 'local'): boolean {
    try {
      return writeRaw(area, key, JSON.stringify(value));
    } catch (error) {
      onError(key, error);
      return false;
    }
  },
  subscribe(
    key: string,
    listener: (value: string | null) => void,
    area: StorageArea = 'local',
  ): () => void {
    return subscribeRaw(area, key, listener);
  },
};

export function getStorageItem(key: string, area: StorageArea = 'local'): string | null {
  return safeStorage.getItem(key, area);
}

export function setStorageItem(
  key: string,
  value: string,
  area: StorageArea = 'local',
): boolean {
  return safeStorage.setItem(key, value, area);
}

export function removeStorageItem(key: string, area: StorageArea = 'local'): void {
  safeStorage.removeItem(key, area);
}

export function getJsonStorageItem<T>(
  key: string,
  area: StorageArea = 'local',
): T | null {
  return safeStorage.getJson<T>(key, area);
}

export function setJsonStorageItem(
  key: string,
  value: unknown,
  area: StorageArea = 'local',
): boolean {
  return safeStorage.setJson(key, value, area);
}

export function subscribeStorageItem(
  key: string,
  listener: (value: string | null) => void,
  area: StorageArea = 'local',
): () => void {
  return safeStorage.subscribe(key, listener, area);
}

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
      const raw = readRaw('local', key);
      if (raw === null) return null;
      try {
        return options.parse(raw);
      } catch (error) {
        onError(key, error);
        return null;
      }
    },
    set(value: T): void {
      try {
        writeRaw('local', key, options.serialize(value));
      } catch (error) {
        onError(key, error);
      }
    },
    remove(): void {
      removeRaw('local', key);
    },
    subscribe(listener: StorageListener<T>): () => void {
      return subscribeRaw('local', key, (raw) => {
        if (raw === null) {
          listener(null);
          return;
        }
        try {
          listener(options.parse(raw));
        } catch (error) {
          onError(key, error);
          listener(null);
        }
      });
    },
  };
}

export function defineBooleanStorage(key: string): StorageEntry<boolean> {
  return defineStorage<boolean>(key, {
    parse: (raw) => raw === 'true',
    serialize: (value) => String(value),
  });
}

export function defineJsonStorage<T>(key: string): StorageEntry<T> {
  return defineStorage<T>(key, {
    parse: (raw) => {
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    serialize: (value) => JSON.stringify(value),
  });
}

export function defineStringStorage(key: string): StorageEntry<string> {
  return defineStorage<string>(key, {
    parse: (raw) => raw,
    serialize: (value) => value,
  });
}
