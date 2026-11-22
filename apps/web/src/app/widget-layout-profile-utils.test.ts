import assert from 'node:assert/strict';
import {
  DEFAULT_WIDGET_LAYOUT_PROFILE_ID,
  getWidgetLayoutStorageKey,
  loadWidgetLayoutForProfile,
  normalizeProfileId,
  readActiveWidgetLayoutProfileId,
  saveWidgetLayoutForProfile,
  writeActiveWidgetLayoutProfileId,
} from './widget-layout-profile-utils';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

function testNormalizeAndKeys(): void {
  assert.equal(normalizeProfileId(''), DEFAULT_WIDGET_LAYOUT_PROFILE_ID);
  assert.equal(normalizeProfileId('  Alice / Ops '), 'Alice---Ops');
  assert.equal(
    getWidgetLayoutStorageKey('alice'),
    'dashboard-widget-layout:alice',
  );
}

function testPersistenceRoundTrip(): void {
  const storage = new MemoryStorage();
  const profile = writeActiveWidgetLayoutProfileId('maintainer', storage);
  assert.equal(profile, 'maintainer');
  assert.equal(readActiveWidgetLayoutProfileId(storage), 'maintainer');

  const layout = [{ id: 'w1', title: 'Success Rate' }];
  saveWidgetLayoutForProfile(profile, layout, storage);
  const loaded = loadWidgetLayoutForProfile(profile, [], storage);
  assert.deepEqual(loaded, layout);

  const missing = loadWidgetLayoutForProfile('other', [{ id: 'fallback' }], storage);
  assert.deepEqual(missing, [{ id: 'fallback' }]);
}

testNormalizeAndKeys();
testPersistenceRoundTrip();
console.log('widget-layout-profile-utils.test.ts: all assertions passed');
