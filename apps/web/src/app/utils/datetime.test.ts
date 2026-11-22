/**
 * Tests for utils/datetime formatters.
 *
 * All tests use fixed UTC instants so results are deterministic across CI
 * timezones. Timezone injection is tested via the optional `timeZone` param.
 *
 * Fixed instant: 2026-08-12T15:45:22Z  (Wed, 12 Aug 2026 15:45:22 UTC)
 */

import {
  absoluteShort,
  absoluteLong,
  relative,
  isoDate,
  timeOnly,
} from './datetime';

const FIXED_ISO = '2026-08-12T15:45:22.000Z';
const FIXED_MS = new Date(FIXED_ISO).getTime(); // epoch ms

// ── absoluteShort ────────────────────────────────────────────────────────────

console.assert(
  absoluteShort(FIXED_ISO, 'UTC') === 'Aug 12, 2026, 3:45 PM',
  `absoluteShort UTC: got "${absoluteShort(FIXED_ISO, 'UTC')}"`,
);

console.assert(
  absoluteShort(FIXED_MS, 'UTC') === 'Aug 12, 2026, 3:45 PM',
  `absoluteShort epoch ms: got "${absoluteShort(FIXED_MS, 'UTC')}"`,
);

console.assert(
  absoluteShort(new Date(FIXED_ISO), 'UTC') === 'Aug 12, 2026, 3:45 PM',
  `absoluteShort Date obj: got "${absoluteShort(new Date(FIXED_ISO), 'UTC')}"`,
);

// UTC+13 (Pacific/Apia) — should be Aug 13
console.assert(
  absoluteShort(FIXED_ISO, 'Pacific/Apia').startsWith('Aug 13, 2026'),
  `absoluteShort UTC+13: got "${absoluteShort(FIXED_ISO, 'Pacific/Apia')}"`,
);

// UTC-11 (Pacific/Niue) — should still be Aug 12 at 04:45
console.assert(
  absoluteShort(FIXED_ISO, 'Pacific/Niue').startsWith('Aug 12, 2026'),
  `absoluteShort UTC-11: got "${absoluteShort(FIXED_ISO, 'Pacific/Niue')}"`,
);

// ── absoluteLong ─────────────────────────────────────────────────────────────

console.assert(
  absoluteLong(FIXED_ISO, 'UTC') === 'August 12, 2026 at 3:45:22 PM',
  `absoluteLong UTC: got "${absoluteLong(FIXED_ISO, 'UTC')}"`,
);

// ── relative ─────────────────────────────────────────────────────────────────

const REF = '2026-08-12T17:00:00.000Z'; // reference "now" = 1h 14m 38s later

console.assert(
  relative(FIXED_ISO, undefined, REF) === '1h ago',
  `relative 1h: got "${relative(FIXED_ISO, undefined, REF)}"`,
);

const REF_MIN = '2026-08-12T15:48:00.000Z'; // 2m 38s later
console.assert(
  relative(FIXED_ISO, undefined, REF_MIN) === '2m ago',
  `relative 2m: got "${relative(FIXED_ISO, undefined, REF_MIN)}"`,
);

const REF_NOW = '2026-08-12T15:45:30.000Z'; // 8s later
console.assert(
  relative(FIXED_ISO, undefined, REF_NOW) === 'just now',
  `relative just now: got "${relative(FIXED_ISO, undefined, REF_NOW)}"`,
);

const REF_DAYS = '2026-08-15T15:45:22.000Z'; // 3d later
console.assert(
  relative(FIXED_ISO, undefined, REF_DAYS) === '3d ago',
  `relative 3d: got "${relative(FIXED_ISO, undefined, REF_DAYS)}"`,
);

// > 30 days — falls back to absoluteShort
const REF_OLD = '2026-09-20T15:45:22.000Z'; // 39d later
console.assert(
  relative(FIXED_ISO, 'UTC', REF_OLD) === 'Aug 12, 2026, 3:45 PM',
  `relative >30d fallback: got "${relative(FIXED_ISO, 'UTC', REF_OLD)}"`,
);

// future-tense guard — returns absoluteShort, not a negative string
const REF_PAST = '2026-08-12T14:00:00.000Z'; // before the event
console.assert(
  relative(FIXED_ISO, 'UTC', REF_PAST) === 'Aug 12, 2026, 3:45 PM',
  `relative future-guard: got "${relative(FIXED_ISO, 'UTC', REF_PAST)}"`,
);

// ── isoDate ──────────────────────────────────────────────────────────────────

console.assert(
  isoDate(FIXED_ISO, 'UTC') === '2026-08-12',
  `isoDate UTC: got "${isoDate(FIXED_ISO, 'UTC')}"`,
);

// UTC+13 → date rolls to Aug 13
console.assert(
  isoDate(FIXED_ISO, 'Pacific/Apia') === '2026-08-13',
  `isoDate UTC+13: got "${isoDate(FIXED_ISO, 'Pacific/Apia')}"`,
);

// UTC-11 → still Aug 12
console.assert(
  isoDate(FIXED_ISO, 'Pacific/Niue') === '2026-08-12',
  `isoDate UTC-11: got "${isoDate(FIXED_ISO, 'Pacific/Niue')}"`,
);

// ── timeOnly ─────────────────────────────────────────────────────────────────

console.assert(
  timeOnly(FIXED_ISO, 'UTC') === '3:45 PM',
  `timeOnly UTC: got "${timeOnly(FIXED_ISO, 'UTC')}"`,
);

console.log('utils/datetime: all assertions passed');
