import { afterEach, describe, expect, it } from 'vitest';
import {
  defineStringStorage,
  getJsonStorageItem,
  safeStorage,
  setJsonStorageItem,
  setStorageErrorHandler,
} from './local-storage';

function makeStore(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size;
    },
  } as Storage;
}

function installWindow(storage: Partial<Storage>): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: storage,
      sessionStorage: storage,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
  });
  return () => {
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
    else delete (globalThis as { window?: unknown }).window;
  };
}

describe('local-storage gateway', () => {
  let restoreWindow: (() => void) | undefined;

  afterEach(() => {
    restoreWindow?.();
    restoreWindow = undefined;
    setStorageErrorHandler(() => undefined);
  });

  it('falls back to memory when browser storage access is blocked', () => {
    const errors: unknown[] = [];
    setStorageErrorHandler((_key, error) => errors.push(error));
    restoreWindow = installWindow({
      get localStorage(): Storage {
        throw new Error('storage blocked');
      },
    } as Partial<Storage>);

    const key = `blocked-${Date.now()}`;
    const entry = defineStringStorage(key);
    entry.set('saved');

    expect(entry.get()).toBe('saved');
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps exact keys and JSON values across the safe helpers', () => {
    restoreWindow = installWindow({ localStorage: makeStore(), sessionStorage: makeStore() } as Partial<Storage>);
    const key = `json-${Date.now()}`;

    setJsonStorageItem(key, { enabled: true });
    expect(getJsonStorageItem<{ enabled: boolean }>(key)).toEqual({ enabled: true });
    expect(safeStorage.getItem(key)).toBe('{"enabled":true}');

    safeStorage.removeItem(key);
    expect(safeStorage.getItem(key)).toBeNull();
  });

  it('notifies subscribers when a value changes or is removed', () => {
    restoreWindow = installWindow({ localStorage: makeStore(), sessionStorage: makeStore() } as Partial<Storage>);
    const key = `subscribe-${Date.now()}`;
    const values: Array<string | null> = [];
    const unsubscribe = safeStorage.subscribe(key, (value) => values.push(value));

    safeStorage.setItem(key, 'one');
    safeStorage.removeItem(key);
    unsubscribe();
    safeStorage.setItem(key, 'ignored');

    expect(values).toEqual(['one', null]);
  });
});
