/**
 * Throwing-storage coverage for #1622: every guarded read path must default
 * sensibly when the Web Storage getter or its methods throw (Safari private
 * mode, hardened enterprise browsers, blocked site data, quota-full).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getWebStorage,
  safeSessionFlag,
  safeSessionGet,
  safeStorageGet,
  safeStorageRemove,
  safeStorageSet,
  setStorageErrorHandler,
} from './local-storage';
import { FLAGS, clearFlag, isEnabled, setFlag, type FlagKey } from './flags';
import {
  captureRunListContext,
  clearRunListContext,
  readRunListContext,
} from '@/app/runs/swipe/run-list-context';

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

function throwingMethodsStore(): Storage {
  const fail = () => { throw new Error('QuotaExceededError'); };
  return { getItem: fail, setItem: fail, removeItem: fail, clear: fail, key: fail, length: 0 };
}

/** A window whose storage *getters* throw, as in blocked-storage contexts. */
function windowWithBlockedStorage(): Record<string, unknown> {
  const win: Record<string, unknown> = { location: { search: '' } };
  for (const kind of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(win, kind, {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
  }
  return win;
}

function windowWith(storage: Storage): Record<string, unknown> {
  return { location: { search: '' }, localStorage: storage, sessionStorage: storage };
}

const onError = vi.fn();

beforeEach(() => {
  onError.mockReset();
  setStorageErrorHandler(onError);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('safe storage helpers', () => {
  it('returns null / no-ops on the server', () => {
    vi.stubGlobal('window', undefined);
    expect(getWebStorage('sessionStorage')).toBeNull();
    expect(safeSessionGet('k')).toBeNull();
    expect(safeStorageSet('localStorage', 'k', 'v')).toBe(false);
    expect(() => safeStorageRemove('localStorage', 'k')).not.toThrow();
  });

  it('does not throw when the storage getter throws', () => {
    vi.stubGlobal('window', windowWithBlockedStorage());
    expect(getWebStorage('localStorage')).toBeNull();
    expect(getWebStorage('sessionStorage')).toBeNull();
    expect(safeSessionGet('k')).toBeNull();
    expect(safeSessionFlag('crashlab:mock-data')).toBe(false);
    expect(safeStorageSet('sessionStorage', 'k', 'v')).toBe(false);
    expect(() => safeStorageRemove('sessionStorage', 'k')).not.toThrow();
  });

  it('routes method errors through the error handler', () => {
    vi.stubGlobal('window', windowWith(throwingMethodsStore()));
    expect(safeStorageGet('localStorage', 'k')).toBeNull();
    expect(safeStorageSet('localStorage', 'k', 'v')).toBe(false);
    safeStorageRemove('localStorage', 'k');
    expect(onError).toHaveBeenCalledTimes(3);
  });

  it('reads and writes through working storage', () => {
    vi.stubGlobal('window', windowWith(makeStore()));
    expect(safeStorageSet('sessionStorage', 'crashlab:mock-data', 'true')).toBe(true);
    expect(safeSessionFlag('crashlab:mock-data')).toBe(true);
    safeStorageRemove('sessionStorage', 'crashlab:mock-data');
    expect(safeSessionGet('crashlab:mock-data')).toBeNull();
  });
});

describe('flags with throwing storage', () => {
  const flag = Object.keys(FLAGS)[0] as FlagKey;

  it('falls back to the flag default when the storage getter throws', () => {
    vi.stubGlobal('window', windowWithBlockedStorage());
    expect(isEnabled(flag)).toBe(!FLAGS[flag].defaultOff);
    expect(() => setFlag(flag, true)).not.toThrow();
    expect(() => clearFlag(flag)).not.toThrow();
  });

  it('falls back to the flag default when getItem throws', () => {
    vi.stubGlobal('window', windowWith(throwingMethodsStore()));
    expect(isEnabled(flag)).toBe(!FLAGS[flag].defaultOff);
  });

  it('still honours a stored override when storage works', () => {
    vi.stubGlobal('window', windowWith(makeStore()));
    setFlag(flag, FLAGS[flag].defaultOff);
    expect(isEnabled(flag)).toBe(FLAGS[flag].defaultOff);
  });
});

describe('run list context with throwing storage', () => {
  it('degrades to no context when the sessionStorage getter throws', () => {
    vi.stubGlobal('window', windowWithBlockedStorage());
    expect(() => captureRunListContext(['a', 'b'])).not.toThrow();
    expect(readRunListContext()).toBeNull();
    expect(() => clearRunListContext()).not.toThrow();
  });

  it('degrades to no context when storage methods throw', () => {
    vi.stubGlobal('window', windowWith(throwingMethodsStore()));
    expect(() => captureRunListContext(['a', 'b'])).not.toThrow();
    expect(readRunListContext()).toBeNull();
  });

  it('round-trips context through working storage', () => {
    vi.stubGlobal('window', windowWith(makeStore()));
    captureRunListContext(['a', 'b']);
    expect(readRunListContext()?.ids).toEqual(['a', 'b']);
    clearRunListContext();
    expect(readRunListContext()).toBeNull();
  });
});
