/**
 * Tests for the onboarding wizard completion persistence.
 *
 * Verifies the durable-write path: read-back verification on localStorage, a
 * sessionStorage fallback when the persistent write fails (Safari private
 * mode / quota), and an in-memory marker as the last resort so the wizard never
 * resurfaces within a session. Also verifies throwing-storage stubs trigger the
 * fallback without throwing (the fix for #1377), leaving the caller free to
 * surface a non-blocking toast.
 */

import * as assert from "node:assert/strict";
import {
  persistCompletionDurably,
  readCompletionFlags,
  WIZARD_COMPLETE_KEY,
  WIZARD_COMPLETE_SESSION_KEY,
  type CompletionPersistenceResult,
} from "./useOnboardingWizard";

class FakeStorage {
  data = new Map<string, string>();
  throws = false;
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.throws) {
      // Simulate Safari private mode: quota exceeded / write denied.
      throw new Error("QuotaExceededError");
    }
    this.data.set(key, value);
  }
}

const runAssertions = () => {
  // Happy path: persistent write verifies via read-back; no session fallback.
  {
    const persist = new FakeStorage();
    const session = new FakeStorage();
    const memory = { value: false };
    const result: CompletionPersistenceResult = persistCompletionDurably(persist, session, memory);
    assert.deepEqual(result, { persistent: true, sessionFallback: false });
    assert.equal(persist.getItem(WIZARD_COMPLETE_KEY), "true");
    assert.equal(session.getItem(WIZARD_COMPLETE_SESSION_KEY), null);
    assert.equal(memory.value, true);
  }

  // Quota/private-mode throw on persistent storage => session fallback used.
  {
    const persist = new FakeStorage();
    persist.throws = true;
    const session = new FakeStorage();
    const memory = { value: false };
    const result = persistCompletionDurably(persist, session, memory);
    assert.deepEqual(result, { persistent: false, sessionFallback: true });
    assert.equal(session.getItem(WIZARD_COMPLETE_SESSION_KEY), "true");
    assert.equal(memory.value, true);
  }

  // Both persistent and session throw => in-memory marker still prevents
  // same-session resurfacing, and no exception escapes (so the calling code can
  // surface a toast instead of crashing).
  {
    const persist = new FakeStorage();
    persist.throws = true;
    const session = new FakeStorage();
    session.throws = true;
    const memory = { value: false };
    assert.doesNotThrow(() => {
      const result = persistCompletionDurably(persist, session, memory);
      assert.deepEqual(result, { persistent: false, sessionFallback: false });
    });
    assert.equal(memory.value, true);
  }

  // Read-back verification failure (silent no-op setItem) is treated as failed
  // durable write even when the call itself does not throw.
  {
    const silentNoop = new FakeStorage();
    silentNoop.setItem = () => {}; // writes nothing
    const session = new FakeStorage();
    const memory = { value: false };
    const result = persistCompletionDurably(silentNoop, session, memory);
    assert.deepEqual(result, { persistent: false, sessionFallback: true });
  }

  // readCompletionFlags reads durable + session + in-memory layers.
  {
    const persist = new FakeStorage();
    persist.setItem(WIZARD_COMPLETE_KEY, "true");
    const session = new FakeStorage();
    session.setItem(WIZARD_COMPLETE_SESSION_KEY, "true");
    const memory = { value: false };
    const flags = readCompletionFlags(persist, session, memory);
    assert.deepEqual(flags, { persistent: true, sessionFallback: true, inMemory: false });
  }

  // readCompletionFlags tolerates throwing storage (private mode read denied).
  {
    const persist = new FakeStorage();
    persist.throws = true;
    const session = new FakeStorage();
    session.throws = true;
    const memory = { value: false };
    assert.doesNotThrow(() => {
      const flags = readCompletionFlags(persist, session, memory);
      assert.deepEqual(flags, { persistent: false, sessionFallback: false, inMemory: false });
    });
  }
};

runAssertions();
console.log("useOnboardingWizard test: all assertions passed");
