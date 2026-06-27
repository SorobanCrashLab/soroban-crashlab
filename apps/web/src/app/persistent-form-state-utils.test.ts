import * as assert from 'node:assert/strict';
import {
  buildDraftStorageKey,
  isDraftExpired,
  mergeWithDefaults,
  serializeDraft,
  deserializeDraft,
} from './persistent-form-state-utils';

const runAssertions = () => {
  assert.equal(buildDraftStorageKey('contact'), 'crashlab:form-draft:contact');

  // Expiry: 0/∞ ttl means never expires; otherwise compare against now.
  assert.equal(isDraftExpired(1000, 0, 999999), false);
  assert.equal(isDraftExpired(1000, 5000, 4000), false); // 3s old < 5s ttl
  assert.equal(isDraftExpired(1000, 5000, 7000), true); // 6s old > 5s ttl

  const defaults = { name: '', email: '', subscribe: false };

  // Merge keeps only known keys and drops stale/extra ones.
  assert.deepEqual(
    mergeWithDefaults(defaults, { name: 'Ada', stale: 'x' } as never),
    { name: 'Ada', email: '', subscribe: false },
  );
  // undefined values fall back to the default.
  assert.deepEqual(mergeWithDefaults(defaults, { email: undefined }), defaults);

  // Round-trip: serialise then deserialise restores the draft (#840).
  const raw = serializeDraft({ name: 'Ada', email: 'a@b.co', subscribe: true }, 1000);
  assert.deepEqual(deserializeDraft(raw, defaults, 0, 2000), {
    name: 'Ada',
    email: 'a@b.co',
    subscribe: true,
  });

  // An expired draft yields the defaults.
  assert.deepEqual(deserializeDraft(raw, defaults, 500, 5000), defaults);

  // Corrupt / missing input never throws — always falls back to defaults.
  assert.deepEqual(deserializeDraft(null, defaults, 0, 0), defaults);
  assert.deepEqual(deserializeDraft('not json', defaults, 0, 0), defaults);
  assert.deepEqual(deserializeDraft('{"value":{}}', defaults, 0, 0), defaults);

  // Defaults are copied, not mutated/shared.
  const out = deserializeDraft(null, defaults, 0, 0);
  assert.notEqual(out, defaults);

  console.log('persistent-form-state-utils: all assertions passed');
};

runAssertions();
