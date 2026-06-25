import * as assert from 'node:assert/strict';
import {
  DEFAULT_PREFERENCES,
  filterByPreferences,
  isInQuietHours,
  toggleType,
  setMinPriority,
  setDigestFrequency,
  validatePreferences,
  loadPreferences,
  savePreferences,
} from './notification-preferences-utils';
import type { NotificationPreferences, NotificationType, NotificationPriority } from './notification-preferences-utils';

function makeNotif(type: NotificationType, priority: NotificationPriority) {
  return { type, priority };
}

function setupLocalStorage() {
  const store: Record<string, string> = {};
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { Object.keys(store).forEach(k => delete store[k]); },
      length: 0,
      key: (_: number) => null,
    },
    writable: true,
    configurable: true,
  });
  return store;
}

{
  const prefs: NotificationPreferences = { ...DEFAULT_PREFERENCES };

  assert.equal(filterByPreferences(makeNotif('info', 'low'), prefs), true);
  assert.equal(filterByPreferences(makeNotif('error', 'critical'), prefs), true);
}

{
  const types: NotificationType[] = ['error', 'warning'];
  const prefs: NotificationPreferences = { ...DEFAULT_PREFERENCES, enabledTypes: types };

  assert.equal(filterByPreferences(makeNotif('info', 'low'), prefs), false);
  assert.equal(filterByPreferences(makeNotif('error', 'critical'), prefs), true);
}

{
  const prefs: NotificationPreferences = { ...DEFAULT_PREFERENCES, minPriority: 'high' };

  assert.equal(filterByPreferences(makeNotif('info', 'low'), prefs), false);
  assert.equal(filterByPreferences(makeNotif('warning', 'medium'), prefs), false);
  assert.equal(filterByPreferences(makeNotif('error', 'high'), prefs), true);
  assert.equal(filterByPreferences(makeNotif('error', 'critical'), prefs), true);
}

{
  const now = new Date('2026-06-24T14:30:00');
  const prefs: NotificationPreferences = { ...DEFAULT_PREFERENCES, quietHoursEnabled: true, quietHoursStart: '22:00', quietHoursEnd: '07:00' };

  assert.equal(isInQuietHours(prefs, now), false);
}

{
  const now = new Date('2026-06-24T23:00:00');
  const prefs: NotificationPreferences = { ...DEFAULT_PREFERENCES, quietHoursEnabled: true, quietHoursStart: '22:00', quietHoursEnd: '07:00' };

  assert.equal(isInQuietHours(prefs, now), true);
}

{
  const prefs = toggleType(DEFAULT_PREFERENCES, 'info');
  assert.equal(prefs.enabledTypes.includes('info'), false);
  assert.equal(prefs.enabledTypes.length, DEFAULT_PREFERENCES.enabledTypes.length - 1);
}

{
  const prefs = setMinPriority(DEFAULT_PREFERENCES, 'critical');
  assert.equal(prefs.minPriority, 'critical');
}

{
  const prefs = setDigestFrequency(DEFAULT_PREFERENCES, 'daily');
  assert.equal(prefs.digestFrequency, 'daily');
}

{
  const result = validatePreferences({ ...DEFAULT_PREFERENCES, enabledTypes: [] as NotificationType[] });
  assert.equal(result, 'At least one notification type must be enabled.');
}

{
  const result = validatePreferences(DEFAULT_PREFERENCES);
  assert.equal(result, null);
}

{
  const store = setupLocalStorage();
  savePreferences({ ...DEFAULT_PREFERENCES, soundEnabled: true });
  const loaded = loadPreferences();
  assert.equal(loaded.soundEnabled, true);

  savePreferences({ ...DEFAULT_PREFERENCES, soundEnabled: false });
  const loaded2 = loadPreferences();
  assert.equal(loaded2.soundEnabled, false);
}

console.log('notification-center-integration.test.ts: all assertions passed');
