import * as assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  validateConfig,
  loadFromStorage,
  saveToStorage,
  resetStorage,
  STORAGE_KEY,
  ApiConfig,
  DRAFT_STORAGE_KEY,
  saveDraft,
  loadDraft,
  clearDraft,
  isSameConfig,
  resolveInitialConfig,
} from './api-config-utils';

class MockStorage {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] || null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = value;
  }

  removeItem(key: string): void {
    delete this.store[key];
  }
}

function testDefaultConfig(): void {
  assert.equal(DEFAULT_CONFIG.backendUrl, '');
  assert.equal(DEFAULT_CONFIG.rateLimitMaxRequests, 100);
  assert.equal(DEFAULT_CONFIG.rateLimitWindowSeconds, 60);
}

function testValidateConfig(): void {
  // Empty url should be fine (optional setting to use mock data)
  const emptyUrlErrors = validateConfig({
    backendUrl: '   ',
    rateLimitMaxRequests: 100,
    rateLimitWindowSeconds: 60,
  });
  assert.equal(emptyUrlErrors.backendUrl, undefined);

  // Valid https URL should be fine
  const validUrlErrors = validateConfig({
    backendUrl: 'https://api.crashlab.io',
    rateLimitMaxRequests: 50,
    rateLimitWindowSeconds: 30,
  });
  assert.deepEqual(validUrlErrors, {});

  // Invalid URL format
  const invalidUrlErrors = validateConfig({
    backendUrl: 'not_a_valid_url',
    rateLimitMaxRequests: 100,
    rateLimitWindowSeconds: 60,
  });
  assert.ok(invalidUrlErrors.backendUrl);
  assert.match(invalidUrlErrors.backendUrl ?? '', /valid URL/i);

  // Invalid protocol
  const invalidProtoErrors = validateConfig({
    backendUrl: 'ftp://api.crashlab.io',
    rateLimitMaxRequests: 100,
    rateLimitWindowSeconds: 60,
  });
  assert.ok(invalidProtoErrors.backendUrl);
  assert.match(invalidProtoErrors.backendUrl ?? '', /http:\/\/ or https:\/\//i);

  // Rate limit max requests bounds checks
  const zeroRequestsErrors = validateConfig({
    backendUrl: '',
    rateLimitMaxRequests: 0,
    rateLimitWindowSeconds: 60,
  });
  assert.ok(zeroRequestsErrors.rateLimitMaxRequests);
  assert.match(zeroRequestsErrors.rateLimitMaxRequests ?? '', /at least 1/i);

  const negativeRequestsErrors = validateConfig({
    backendUrl: '',
    rateLimitMaxRequests: -10,
    rateLimitWindowSeconds: 60,
  });
  assert.ok(negativeRequestsErrors.rateLimitMaxRequests);

  const floatRequestsErrors = validateConfig({
    backendUrl: '',
    rateLimitMaxRequests: 1.5,
    rateLimitWindowSeconds: 60,
  });
  assert.ok(floatRequestsErrors.rateLimitMaxRequests);

  // Rate limit window bounds checks
  const zeroWindowErrors = validateConfig({
    backendUrl: '',
    rateLimitMaxRequests: 100,
    rateLimitWindowSeconds: 0,
  });
  assert.ok(zeroWindowErrors.rateLimitWindowSeconds);
  assert.match(zeroWindowErrors.rateLimitWindowSeconds ?? '', /at least 1/i);

  const floatWindowErrors = validateConfig({
    backendUrl: '',
    rateLimitMaxRequests: 100,
    rateLimitWindowSeconds: 5.5,
  });
  assert.ok(floatWindowErrors.rateLimitWindowSeconds);
}

function testStorageHelpers(): void {
  const storage = new MockStorage() as unknown as Storage;

  // Empty storage returns default config
  const loadedDefault = loadFromStorage(storage);
  assert.deepEqual(loadedDefault, DEFAULT_CONFIG);

  // Save config
  const configToSave: ApiConfig = {
    backendUrl: 'https://api.custom.org',
    rateLimitMaxRequests: 500,
    rateLimitWindowSeconds: 120,
  };
  const saveSuccess = saveToStorage(configToSave, storage);
  assert.ok(saveSuccess);

  // Load saved config
  const loadedSaved = loadFromStorage(storage);
  assert.deepEqual(loadedSaved, configToSave);

  // Load corrupted config recovers gracefully to defaults
  storage.setItem(STORAGE_KEY, 'corrupted { json');
  const loadedCorrupted = loadFromStorage(storage);
  assert.deepEqual(loadedCorrupted, DEFAULT_CONFIG);

  // Reset storage
  storage.setItem(STORAGE_KEY, JSON.stringify(configToSave));
  resetStorage(storage);
  assert.equal(storage.getItem(STORAGE_KEY), null);
  const loadedAfterReset = loadFromStorage(storage);
  assert.deepEqual(loadedAfterReset, DEFAULT_CONFIG);
}

// #1074: unsaved edits must survive the browser discarding a backgrounded tab.
function testDraftHelpers(): void {
  const storage = new MockStorage() as unknown as Storage;

  // No draft yet.
  assert.equal(loadDraft(storage), null);

  const draft: ApiConfig = {
    backendUrl: 'https://api.in-progress.dev',
    rateLimitMaxRequests: 250,
    rateLimitWindowSeconds: 90,
  };

  assert.ok(saveDraft(draft, storage));
  assert.deepEqual(loadDraft(storage), draft);

  // The draft lives under its own key, so it never masquerades as saved config.
  assert.deepEqual(loadFromStorage(storage), DEFAULT_CONFIG);
  assert.notEqual(DRAFT_STORAGE_KEY, STORAGE_KEY);

  // A half-typed value is preserved verbatim rather than snapped back to the
  // default, so its validation message reappears after the tab is restored.
  assert.ok(saveDraft({ ...draft, rateLimitMaxRequests: 0 }, storage));
  assert.equal(loadDraft(storage)?.rateLimitMaxRequests, 0);
  assert.ok(validateConfig(loadDraft(storage) as ApiConfig).rateLimitMaxRequests);

  // A corrupt or wrongly-typed draft can never break the form.
  storage.setItem(DRAFT_STORAGE_KEY, 'corrupted { json');
  assert.equal(loadDraft(storage), null);

  storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ backendUrl: 42 }));
  assert.deepEqual(loadDraft(storage), DEFAULT_CONFIG);

  // Clearing removes only the draft.
  saveToStorage(draft, storage);
  saveDraft(draft, storage);
  clearDraft(storage);
  assert.equal(loadDraft(storage), null);
  assert.deepEqual(loadFromStorage(storage), draft);
}

function testResolveInitialConfig(): void {
  const saved: ApiConfig = {
    backendUrl: 'https://api.saved.dev',
    rateLimitMaxRequests: 100,
    rateLimitWindowSeconds: 60,
  };

  // No draft => mount from the saved config.
  assert.deepEqual(resolveInitialConfig(saved, null), saved);

  // A draft matching the saved config is not a pending edit.
  assert.deepEqual(resolveInitialConfig(saved, { ...saved }), saved);
  assert.equal(isSameConfig(saved, { ...saved }), true);

  // A genuinely different draft wins — this is the state that used to be lost.
  const pending: ApiConfig = { ...saved, backendUrl: 'https://api.half-typed' };
  assert.deepEqual(resolveInitialConfig(saved, pending), pending);
  assert.equal(isSameConfig(saved, pending), false);

  // Numeric-only edits count too.
  assert.equal(isSameConfig(saved, { ...saved, rateLimitMaxRequests: 101 }), false);
  assert.equal(isSameConfig(saved, { ...saved, rateLimitWindowSeconds: 61 }), false);
}

testDefaultConfig();
testValidateConfig();
testStorageHelpers();
testDraftHelpers();
testResolveInitialConfig();

console.log('settings/api/api-config-utils.test.ts: all assertions passed');
