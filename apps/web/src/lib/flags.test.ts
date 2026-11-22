import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FLAGS, isEnabled, setFlag, clearFlag, getEnabledFlags, FlagKey } from './flags';
import { safeStorage } from './local-storage';

function makeTestStorage(): Storage {
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

describe('feature flags', () => {
  beforeEach(() => {
    const localStorage = makeTestStorage();
    vi.stubGlobal('window', {
      localStorage,
      sessionStorage: makeTestStorage(),
      get location() {
        return { search: '' };
      },
    });
    for (const flag of Object.keys(FLAGS)) safeStorage.removeItem(`crashlab:flag:${flag}`);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('FLAGS registry', () => {
    it('has at least two flags', () => {
      expect(Object.keys(FLAGS).length).toBeGreaterThanOrEqual(2);
    });

    it('each flag has required fields', () => {
      for (const flag of Object.values(FLAGS)) {
        expect(flag).toHaveProperty('name');
        expect(flag).toHaveProperty('description');
        expect(flag).toHaveProperty('defaultOff');
        expect(typeof flag.name).toBe('string');
        expect(typeof flag.description).toBe('string');
        expect(typeof flag.defaultOff).toBe('boolean');
      }
    });
  });

  describe('isEnabled', () => {
    it('returns !defaultOff when no overrides exist', () => {
      for (const [key, flag] of Object.entries(FLAGS)) {
        expect(isEnabled(key as FlagKey)).toBe(!flag.defaultOff);
      }
    });

    it('returns true for defaultOff flags when URL override is ?flag:name=true', () => {
      const flag = Object.keys(FLAGS)[0] as FlagKey;
      vi.spyOn(window, 'location', 'get').mockReturnValue({
        ...window.location,
        search: `?flag:${flag}=true`,
      } as Location);
      expect(isEnabled(flag)).toBe(true);
    });

    it('returns false for defaultOn flags when URL override is ?flag:name=false', () => {
      const defaultOnFlag = (Object.entries(FLAGS).find(([, f]) => !f.defaultOff) ?? [null])[0] as FlagKey | null;
      if (!defaultOnFlag) return;
      vi.spyOn(window, 'location', 'get').mockReturnValue({
        ...window.location,
        search: `?flag:${defaultOnFlag}=false`,
      } as Location);
      expect(isEnabled(defaultOnFlag)).toBe(false);
    });

    it('URL override takes precedence over localStorage', () => {
      const flag = Object.keys(FLAGS)[0] as FlagKey;
      safeStorage.setItem(`crashlab:flag:${flag}`, 'false');
      vi.spyOn(window, 'location', 'get').mockReturnValue({
        ...window.location,
        search: `?flag:${flag}=true`,
      } as Location);
      expect(isEnabled(flag)).toBe(true);
    });

    it('localStorage overrides default when no URL override', () => {
      const flag = Object.keys(FLAGS)[0] as FlagKey;
      safeStorage.setItem(`crashlab:flag:${flag}`, 'true');
      expect(isEnabled(flag)).toBe(true);
    });

    it('ignores invalid URL flag values', () => {
      const flag = Object.keys(FLAGS)[0] as FlagKey;
      vi.spyOn(window, 'location', 'get').mockReturnValue({
        ...window.location,
        search: `?flag:${flag}=invalid`,
      } as Location);
      expect(isEnabled(flag)).toBe(!FLAGS[flag].defaultOff);
    });

    it('ignores invalid localStorage values', () => {
      const flag = Object.keys(FLAGS)[0] as FlagKey;
      safeStorage.setItem(`crashlab:flag:${flag}`, 'invalid');
      expect(isEnabled(flag)).toBe(!FLAGS[flag].defaultOff);
    });
  });

  describe('setFlag / clearFlag', () => {
    it('setFlag persists to localStorage', () => {
      const flag = Object.keys(FLAGS)[0] as FlagKey;
      setFlag(flag, true);
      expect(safeStorage.getItem(`crashlab:flag:${flag}`)).toBe('true');
    });

    it('clearFlag removes from localStorage', () => {
      const flag = Object.keys(FLAGS)[0] as FlagKey;
      setFlag(flag, true);
      clearFlag(flag);
      expect(safeStorage.getItem(`crashlab:flag:${flag}`)).toBeNull();
    });
  });

  describe('getEnabledFlags', () => {
    it('returns only flags that resolve to enabled', () => {
      const enabled = getEnabledFlags();
      for (const flag of enabled) {
        expect(isEnabled(flag)).toBe(true);
      }
    });
  });

  describe('SSR safety', () => {
    it('isEnabled returns default when window is undefined', () => {
      const originalWindow = globalThis.window;
      // @ts-expect-error testing SSR
      delete globalThis.window;
      const flag = Object.keys(FLAGS)[0] as FlagKey;
      expect(isEnabled(flag)).toBe(!FLAGS[flag].defaultOff);
      globalThis.window = originalWindow;
    });
  });
});
