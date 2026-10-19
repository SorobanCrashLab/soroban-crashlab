/**
 * Pure utility for converting timestamps to local calendar dates.
 * Issue #1351: Analytics calendar heatmap misaligns cells for timezones ahead of UTC.
 */

/**
 * Returns the local timezone offset in minutes for a given date.
 * Positive values are east of UTC (e.g. UTC+9 => 540).
 */
function localOffsetMinutes(date: Date): number {
  return -date.getTimezoneOffset();
}

/**
 * Converts an ISO timestamp to a local YYYY-MM-DD key.
 *
 * Uses the browser's local timezone to determine the calendar date,
 * ensuring consistency with how dates are displayed in the runs list.
 * Offsets are applied explicitly so cells align for timezones ahead of
 * UTC instead of relying on the host's implicit Date parsing behavior.
 *
 * @param isoTimestamp - ISO 8601 timestamp string
 * @returns Local calendar date in YYYY-MM-DD format
 */
export function localDateKey(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid ISO timestamp: ${isoTimestamp}`);
  }
  const shifted = new Date(date.getTime() + localOffsetMinutes(date) * 60_000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
