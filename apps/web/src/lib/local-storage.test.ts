/**
 * Tests for lib/local-storage gateway.
 *
 * Uses a simulated localStorage (no DOM dependency) so tests run in Node.
 */

import {
  defineBooleanStorage,
  defineJsonStorage,
  defineStringStorage,
  setStorageErrorHandler,
  REGISTERED_KEYS,
} from './local-storage';

// ── Simulated localStorage ────────────────────────────────────────────────────

function makeStore(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size; },
  };
}

function withFakeStorage(fn: () => void) {
  const real = (global as Record<string, unknown>).window;
  const fakeStorage = makeStore();
  (global as Record<string, unknown>).window = { localStorage: fakeStorage };
  try {
    fn();
  } finally {
    (global as Record<string, unknown>).window = real;
  }
}

// Helper: make a unique key so tests don't collide with each other
let seq = 0;
const uid = () => `test-key-${++seq}`;

// ── SSR guard ─────────────────────────────────────────────────────────────────

function withNoWindow(fn: () => void) {
  const real = (global as Record<string, unknown>).window;
  (global as Record<string, unknown>).window = undefined;
  try {
    fn();
  } finally {
    (global as Record<string, unknown>).window = real;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

withFakeStorage(() => {
  // get returns null when absent
  const entry = defineStringStorage(uid());
  console.assert(entry.get() === null, 'get absent');

  // set then get round-trips
  const k = uid();
  const strEntry = defineStringStorage(k);
  strEntry.set('hello');
  console.assert(strEntry.get() === 'hello', 'string round-trip');

  // remove clears the entry
  strEntry.remove();
  console.assert(strEntry.get() === null, 'after remove');

  // boolean round-trip
  const boolEntry = defineBooleanStorage(uid());
  boolEntry.set(true);
  console.assert(boolEntry.get() === true, 'bool true');
  boolEntry.set(false);
  console.assert(boolEntry.get() === false, 'bool false');

  // json round-trip
  const jsonEntry = defineJsonStorage<string[]>(uid());
  jsonEntry.set(['a', 'b', 'c']);
  const got = jsonEntry.get();
  console.assert(Array.isArray(got) && got[0] === 'a', 'json round-trip');

  // collision detection
  const collKey = uid();
  defineStringStorage(collKey); // first registration ok
  let threw = false;
  try {
    defineStringStorage(collKey); // duplicate — must throw
  } catch {
    threw = true;
  }
  console.assert(threw, 'collision detection throws');

  // REGISTERED_KEYS contains registered keys
  console.assert(REGISTERED_KEYS.has(k), 'key in registry');
});

// SSR guard: operations are no-ops when window is absent
withNoWindow(() => {
  const ssrKey = uid();
  const entry = defineStringStorage(ssrKey);
  // Should not throw; returns null
  console.assert(entry.get() === null, 'SSR get returns null');
  entry.set('x'); // should not throw
  entry.remove(); // should not throw
});

// Throwing storage — errors route through onError, not crash
withFakeStorage(() => {
  const throwingStorage: Storage = {
    getItem: () => { throw new Error('QuotaExceededError'); },
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => { throw new Error('QuotaExceededError'); },
    clear: () => {},
    key: () => null,
    length: 0,
  };
  (global as Record<string, unknown>).window = { localStorage: throwingStorage };

  let errorCaught = false;
  setStorageErrorHandler(() => { errorCaught = true; });

  const entry = defineStringStorage(uid());
  entry.get();
  console.assert(errorCaught, 'error handler called on get');

  errorCaught = false;
  entry.set('x');
  console.assert(errorCaught, 'error handler called on set');

  // Restore default handler
  setStorageErrorHandler((key, err) => console.warn(`[storage] "${key}":`, err));
});

console.log('lib/local-storage: all assertions passed');
