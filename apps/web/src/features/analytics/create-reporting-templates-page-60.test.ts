import * as assert from 'node:assert/strict';
import { isQuotaExceededError, safeWriteStorage } from './create-reporting-templates-page-60';

// isQuotaExceededError — non-DOMException values
assert.equal(isQuotaExceededError(null), false);
assert.equal(isQuotaExceededError(undefined), false);
assert.equal(isQuotaExceededError(new Error('generic')), false);

// isQuotaExceededError — DOMException by name
assert.equal(isQuotaExceededError(new DOMException('full', 'QuotaExceededError')), true);
assert.equal(isQuotaExceededError(new DOMException('full', 'NS_ERROR_DOM_QUOTA_REACHED')), true);

// isQuotaExceededError — unrelated DOMException
assert.equal(isQuotaExceededError(new DOMException('not found', 'NotFoundError')), false);

// isQuotaExceededError — legacy numeric codes
// (DOMException#code is a getter-only property on the prototype in Node,
// so Object.assign silently fails; defineProperty overrides it on the instance)
function domExceptionWithLegacyCode(code: number): DOMException {
  const error = new DOMException('full');
  Object.defineProperty(error, 'code', { value: code, configurable: true });
  return error;
}

assert.equal(isQuotaExceededError(domExceptionWithLegacyCode(22)), true);
assert.equal(isQuotaExceededError(domExceptionWithLegacyCode(1014)), true);

// safeWriteStorage — successful write returns true
{
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;

  const ok = safeWriteStorage('some-key', 'some-value');
  assert.equal(ok, true);
  assert.equal(store.get('some-key'), 'some-value');
}

// safeWriteStorage — quota exceeded is caught and reported as failure, not thrown
{
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: () => null,
    setItem: () => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    },
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
  } as Storage;

  let threw = false;
  let ok: boolean | undefined;
  try {
    ok = safeWriteStorage('some-key', 'some-value');
  } catch {
    threw = true;
  }

  assert.equal(threw, false, 'safeWriteStorage must not throw on quota exceeded');
  assert.equal(ok, false, 'safeWriteStorage must report failure so callers can surface it to the user');
}

console.log('create-reporting-templates-page-60.test.ts: all assertions passed');
