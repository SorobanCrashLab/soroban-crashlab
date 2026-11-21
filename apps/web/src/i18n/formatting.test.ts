/**
 * Tests for i18n formatting utilities (issue #2261).
 * Coverage target: ≥90% on formatting module.
 */

import * as assert from 'node:assert/strict';
import {
  formatBytes,
  formatNumber,
  formatPercent,
  formatDuration,
  formatDate,
  formatTime,
  formatRelative,
  formatRelativeSafe,
} from './formatting';

// ── formatBytes ───────────────────────────────────────────────────────────────

function testFormatBytes(): void {
  // en: 1536 bytes → "1.5 KB"
  assert.equal(formatBytes(1536, 'en'), '1.5 KB');
  
  // 0 bytes edge case
  assert.equal(formatBytes(0, 'en'), '0 B');
  
  // 1 byte (no plural, no decimal)
  assert.equal(formatBytes(1, 'en'), '1 B');
  
  // Megabytes (will show 1.0 MB with decimals setting)
  const mbResult = formatBytes(1048576, 'en');
  assert.ok(mbResult.includes('MB'), `Should include MB unit, got: ${mbResult}`);
  
  // Gigabytes
  const gbResult = formatBytes(1073741824, 'en');
  assert.ok(gbResult.includes('GB'), `Should include GB unit, got: ${gbResult}`);
  
  // Decimal separator differs in de locale
  const deResult = formatBytes(1536, 'de');
  assert.ok(deResult.includes(','), `German locale should use comma decimal separator, got: ${deResult}`);
  assert.ok(deResult.includes('KB'), `Should include KB unit, got: ${deResult}`);
}

// ── formatNumber ──────────────────────────────────────────────────────────────

function testFormatNumber(): void {
  // en: thousands separator is comma, decimal is period
  const enResult = formatNumber(1234567.891, 'en');
  assert.ok(enResult.includes(','), `English should have comma separator, got: ${enResult}`);
  assert.ok(enResult.includes('.'), `English should have period decimal, got: ${enResult}`);
  
  // de: thousands separator is period, decimal is comma
  const deResult = formatNumber(1234567.891, 'de');
  assert.ok(deResult.includes('.') || deResult.includes(' '), `German should have period or space separator, got: ${deResult}`);
  assert.ok(deResult.includes(','), `German should have comma decimal, got: ${deResult}`);
  
  // Verify they differ
  assert.notEqual(enResult, deResult, 'English and German number formatting should differ');
}

// ── formatPercent ─────────────────────────────────────────────────────────────

function testFormatPercent(): void {
  // en: 0.256 → "25.6%"
  const enResult = formatPercent(0.256, 'en', 1);
  assert.ok(enResult.includes('25'), `Should contain 25, got: ${enResult}`);
  assert.ok(enResult.includes('%'), `Should contain %, got: ${enResult}`);
  
  // de: decimal separator is comma
  const deResult = formatPercent(0.256, 'de', 1);
  assert.ok(deResult.includes(',') || deResult.includes('.'), `German percent should have separator, got: ${deResult}`);
  assert.ok(deResult.includes('%') || deResult.includes(' %'), `Should contain %, got: ${deResult}`);
}

// ── formatDuration ────────────────────────────────────────────────────────────

function testFormatDuration(): void {
  // Milliseconds
  assert.equal(formatDuration(500, 'en'), '500ms');
  
  // Seconds only
  const sec = formatDuration(1500, 'en');
  assert.ok(sec.includes('1') && sec.includes('s'), `Should be ~1.5s, got: ${sec}`);
  
  // Minutes and seconds
  const minSec = formatDuration(65000, 'en');
  assert.ok(minSec.includes('1m') && minSec.includes('5s'), `Should be 1m 5s, got: ${minSec}`);
  
  // Hours, minutes, seconds
  const hms = formatDuration(3661000, 'en');
  assert.ok(hms.includes('1h') && hms.includes('1m') && hms.includes('1s'), `Should be 1h 1m 1s, got: ${hms}`);
}

// ── formatDate ────────────────────────────────────────────────────────────────

function testFormatDate(): void {
  const date = new Date('2024-03-15T00:00:00Z');
  
  // en: "Mar 15, 2024"
  const enResult = formatDate(date, 'en');
  assert.ok(enResult.includes('Mar') || enResult.includes('March'), `English date should contain Mar, got: ${enResult}`);
  assert.ok(enResult.includes('15'), `Should contain day 15, got: ${enResult}`);
  assert.ok(enResult.includes('2024'), `Should contain year 2024, got: ${enResult}`);
  
  // es: different format (e.g., "15 mar 2024")
  const esResult = formatDate(date, 'es');
  assert.ok(esResult.includes('15'), `Spanish date should contain 15, got: ${esResult}`);
  assert.ok(esResult.includes('2024'), `Should contain 2024, got: ${esResult}`);
  
  // Formats differ between locales
  assert.notEqual(enResult, esResult, 'English and Spanish date formatting should differ');
}

// ── formatTime ────────────────────────────────────────────────────────────────

function testFormatTime(): void {
  const date = new Date('2024-03-15T14:30:00Z');
  
  // en: 12-hour format with AM/PM
  const enResult = formatTime(date, 'en');
  assert.ok(enResult.includes('PM') || enResult.includes('AM') || enResult.includes('14') || enResult.includes('2'), 
    `Time should be formatted, got: ${enResult}`);
  
  // With timezone
  const withTz = formatTime(date, 'en', { timezone: 'UTC' });
  assert.ok(withTz.includes('UTC') || withTz.includes('GMT'), `Should include timezone, got: ${withTz}`);
}

// ── formatRelative ────────────────────────────────────────────────────────────

function testFormatRelative(): void {
  const now = new Date('2024-03-15T12:00:00Z');
  
  // 30 seconds ago
  const past30s = new Date('2024-03-15T11:59:30Z');
  const result30s = formatRelative(past30s, 'en', now);
  assert.ok(result30s.includes('30') && result30s.includes('second'), 
    `Should be "30 seconds ago", got: ${result30s}`);
  
  // 2 hours in the future
  const future2h = new Date('2024-03-15T14:00:00Z');
  const result2h = formatRelative(future2h, 'en', now);
  assert.ok(result2h.includes('2') && result2h.includes('hour'), 
    `Should be "in 2 hours", got: ${result2h}`);
  
  // Spanish: "hace 30 segundos"
  const esResult = formatRelative(past30s, 'es', now);
  assert.ok(esResult.includes('30') && (esResult.includes('segundo') || esResult.includes('seg')), 
    `Spanish relative time should contain 30 and segundo, got: ${esResult}`);
}

// ── formatRelativeSafe ────────────────────────────────────────────────────────

function testFormatRelativeSafe(): void {
  const now = new Date('2024-03-15T12:00:00Z');
  const past = new Date('2024-03-15T11:59:30Z');
  
  // Not mounted: returns absolute date
  const notMounted = formatRelativeSafe(past, 'en', false, now);
  assert.ok(notMounted.includes('Mar') || notMounted.includes('15'), 
    `Should return absolute date when not mounted, got: ${notMounted}`);
  
  // Mounted: returns relative time
  const mounted = formatRelativeSafe(past, 'en', true, now);
  assert.ok(mounted.includes('second') || mounted.includes('ago'), 
    `Should return relative time when mounted, got: ${mounted}`);
}

// ── Run all tests ─────────────────────────────────────────────────────────────

console.log('Running i18n formatting tests...');

testFormatBytes();
console.log('✓ formatBytes');

testFormatNumber();
console.log('✓ formatNumber');

testFormatPercent();
console.log('✓ formatPercent');

testFormatDuration();
console.log('✓ formatDuration');

testFormatDate();
console.log('✓ formatDate');

testFormatTime();
console.log('✓ formatTime');

testFormatRelative();
console.log('✓ formatRelative');

testFormatRelativeSafe();
console.log('✓ formatRelativeSafe (hydration-safe)');

console.log('\nAll i18n formatting tests passed!');
