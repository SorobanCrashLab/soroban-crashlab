import * as assert from 'node:assert/strict';
import {
  type NotificationPreferences,
  type NotificationType,
  type NotificationPriority,
  DEFAULT_PREFERENCES,
  getPriorityOrder,
  meetsMinPriority,
  isTypeEnabled,
  filterByPreferences,
  isInQuietHours,
  validatePreferences,
  toggleType,
  setMinPriority,
  setDigestFrequency,
} from './notification-preferences-utils';

const makePrefs = (
  overrides: Partial<NotificationPreferences> = {},
): NotificationPreferences => ({
  ...DEFAULT_PREFERENCES,
  ...overrides,
});

const makeNotif = (
  type: NotificationType,
  priority: NotificationPriority,
) => ({ type, priority });

{
  const p = getPriorityOrder('low');
  assert.equal(p, 0);
}
{
  const p = getPriorityOrder('medium');
  assert.equal(p, 1);
}
{
  const p = getPriorityOrder('high');
  assert.equal(p, 2);
}
{
  const p = getPriorityOrder('critical');
  assert.equal(p, 3);
}

{
  assert.ok(meetsMinPriority('high', 'low'));
  assert.ok(meetsMinPriority('high', 'high'));
  assert.ok(!meetsMinPriority('low', 'medium'));
  assert.ok(!meetsMinPriority('low', 'critical'));
}

{
  assert.ok(isTypeEnabled('info', ['info', 'warning']));
  assert.ok(!isTypeEnabled('error', ['info', 'warning']));
  assert.ok(isTypeEnabled('error', ['info', 'warning', 'error']));
}

{
  const prefs = makePrefs({ enabledTypes: ['info', 'warning'], minPriority: 'medium' });

  assert.ok(!filterByPreferences(makeNotif('info', 'low'), prefs));
  assert.ok(!filterByPreferences(makeNotif('error', 'critical'), prefs));
  assert.ok(filterByPreferences(makeNotif('warning', 'critical'), prefs));
  assert.ok(!filterByPreferences(makeNotif('info', 'low'), makePrefs({ enabledTypes: ['warning'], minPriority: 'low' })));
  assert.ok(!filterByPreferences(makeNotif('info', 'low'), makePrefs({ enabledTypes: ['info'], minPriority: 'medium' })));
}

{
  const prefs = makePrefs({
    quietHoursEnabled: true,
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00',
  });

  const duringQuiet = new Date();
  duringQuiet.setHours(23, 0, 0, 0);
  assert.ok(isInQuietHours(prefs, duringQuiet));

  const outsideQuiet = new Date();
  outsideQuiet.setHours(14, 0, 0, 0);
  assert.ok(!isInQuietHours(prefs, outsideQuiet));
}

{
  const prefs = makePrefs({
    quietHoursEnabled: true,
    quietHoursStart: '09:00',
    quietHoursEnd: '17:00',
  });

  const during = new Date();
  during.setHours(12, 0, 0, 0);
  assert.ok(isInQuietHours(prefs, during));

  const before = new Date();
  before.setHours(8, 0, 0, 0);
  assert.ok(!isInQuietHours(prefs, before));

  const after = new Date();
  after.setHours(18, 0, 0, 0);
  assert.ok(!isInQuietHours(prefs, after));
}

{
  const prefs = makePrefs({ quietHoursEnabled: false });
  assert.ok(!isInQuietHours(prefs));
}

{
  const prefs = makePrefs({ enabledTypes: [] as NotificationType[] });
  const err = validatePreferences(prefs);
  assert.equal(err, 'At least one notification type must be enabled.');
}

{
  const prefs = makePrefs({
    quietHoursEnabled: true,
    quietHoursStart: 'invalid',
    quietHoursEnd: '07:00',
  });
  const err = validatePreferences(prefs);
  assert.ok(err !== null);
  assert.ok(err.includes('Invalid quiet hours'));
}

{
  const prefs = makePrefs({
    quietHoursEnabled: true,
    quietHoursStart: '22:00',
    quietHoursEnd: 'invalid',
  });
  const err = validatePreferences(prefs);
  assert.ok(err !== null);
  assert.ok(err.includes('Invalid quiet hours'));
}

{
  const prefs = makePrefs({
    quietHoursEnabled: true,
    quietHoursStart: '22:00',
    quietHoursEnd: '22:00',
  });
  const err = validatePreferences(prefs);
  assert.equal(err, 'Quiet hours start and end cannot be the same.');
}

{
  const prefs = makePrefs();
  const err = validatePreferences(prefs);
  assert.equal(err, null);
}

{
  const prefs = makePrefs({ enabledTypes: ['info'] });
  const toggled = toggleType(prefs, 'warning');
  assert.deepEqual(toggled.enabledTypes, ['info', 'warning']);

  const toggledBack = toggleType(toggled, 'info');
  assert.deepEqual(toggledBack.enabledTypes, ['warning']);
}

{
  const prefs = makePrefs({ minPriority: 'low' });
  const result = setMinPriority(prefs, 'critical');
  assert.equal(result.minPriority, 'critical');
}

{
  const prefs = makePrefs({ digestFrequency: 'realtime' });
  const result = setDigestFrequency(prefs, 'daily');
  assert.equal(result.digestFrequency, 'daily');
}

console.log(
  'notification-preferences-utils.test.ts: all assertions passed',
);
