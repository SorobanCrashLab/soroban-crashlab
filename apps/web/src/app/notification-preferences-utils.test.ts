import {
  DEFAULT_CHANNELS,
  DEFAULT_CHANNEL_PREFERENCES,
  DEFAULT_PREFERENCES,
  mockNotifications,
  filterByPreferences,
  toggleType,
  validatePreferences,
  isQuietHoursActive,
  getQuietHoursPreviewText,
  validateQuietHoursTime,
} from './notification-preferences-utils';

console.assert(DEFAULT_CHANNELS.length === 3, 'Should have 3 default channels');
console.assert(DEFAULT_CHANNEL_PREFERENCES.length === 3, 'Should have 3 default channel preferences');
console.assert(DEFAULT_PREFERENCES.enabledTypes.length === 4, 'Should enable 4 notification types');
console.assert(mockNotifications.length === 3, 'Should have 3 mock notifications');
console.assert(DEFAULT_CHANNELS[0].id === 'in-app', 'First channel should be in-app');
console.assert(
  mockNotifications.some(n => n.severity === 'error'),
  'Should have error severity notification'
);
console.assert(filterByPreferences({ type: 'info', priority: 'low' }, DEFAULT_PREFERENCES) === true);
console.assert(toggleType(DEFAULT_PREFERENCES, 'info').enabledTypes.includes('info') === false);
console.assert(validatePreferences(DEFAULT_PREFERENCES) === null);

function makeDate(hour: number, minute: number): Date {
  const d = new Date('2026-08-28T00:00:00.000Z');
  d.setHours(hour, minute, 0, 0);
  return d;
}

// Quiet Hours Tests
// 1. Normal window (08:00 - 17:00)
console.assert(isQuietHoursActive('08:00', '17:00', makeDate(12, 0)) === true, 'Normal window active during day');
console.assert(isQuietHoursActive('08:00', '17:00', makeDate(19, 0)) === false, 'Normal window inactive outside window');

// 2. Wraparound window (22:00 - 08:00 & 08:00 - 02:00)
console.assert(isQuietHoursActive('22:00', '08:00', makeDate(23, 30)) === true, 'Wraparound window active late night');
console.assert(isQuietHoursActive('22:00', '08:00', makeDate(5, 0)) === true, 'Wraparound window active early morning');
console.assert(isQuietHoursActive('22:00', '08:00', makeDate(14, 0)) === false, 'Wraparound window inactive during afternoon');
console.assert(isQuietHoursActive('08:00', '02:00', makeDate(23, 0)) === true, 'Wraparound 08:00 to 02:00 active at 23:00');
console.assert(isQuietHoursActive('08:00', '02:00', makeDate(5, 0)) === false, 'Wraparound 08:00 to 02:00 inactive at 05:00');

// 3. Start == End rejection
console.assert(isQuietHoursActive('08:00', '08:00', makeDate(8, 0)) === false, 'Identical start and end returns false');
const identicalPrefs = { ...DEFAULT_PREFERENCES, quietHoursEnabled: true, quietHoursStart: '10:00', quietHoursEnd: '10:00' };
console.assert(validatePreferences(identicalPrefs) === 'Quiet hours start and end times cannot be identical.', 'validatePreferences rejects identical start/end');

// 4. Boundary minute inclusivity documented by test names
function testBoundaryMinuteInclusivity_StartInclusive(): void {
  console.assert(isQuietHoursActive('08:00', '17:00', makeDate(8, 0)) === true, 'Start minute 08:00 is inclusive');
}

function testBoundaryMinuteInclusivity_EndExclusive(): void {
  console.assert(isQuietHoursActive('08:00', '17:00', makeDate(17, 0)) === false, 'End minute 17:00 is exclusive');
}

function testBoundaryMinuteInclusivity_WraparoundStartInclusive(): void {
  console.assert(isQuietHoursActive('22:00', '08:00', makeDate(22, 0)) === true, 'Wraparound start minute 22:00 is inclusive');
}

function testBoundaryMinuteInclusivity_WraparoundEndExclusive(): void {
  console.assert(isQuietHoursActive('22:00', '08:00', makeDate(8, 0)) === false, 'Wraparound end minute 08:00 is exclusive');
}

testBoundaryMinuteInclusivity_StartInclusive();
testBoundaryMinuteInclusivity_EndExclusive();
testBoundaryMinuteInclusivity_WraparoundStartInclusive();
testBoundaryMinuteInclusivity_WraparoundEndExclusive();

// 5. Time format validation & preview text
console.assert(validateQuietHoursTime('25:00') === false, '25:00 is invalid time format');
console.assert(getQuietHoursPreviewText('22:00', '08:00').includes('overnight'), 'Wraparound preview includes overnight description');
console.assert(getQuietHoursPreviewText('08:00', '17:00').includes('daily'), 'Normal window preview includes daily description');

console.log('✓ Notification preferences utilities tests passed');
