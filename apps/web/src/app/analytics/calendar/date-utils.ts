/**
 * Pure utility for converting timestamps to local calendar dates.
 * Issue #1351: Analytics calendar heatmap misaligns cells for timezones ahead of UTC.
 */

/**
 * Converts an ISO timestamp to a local YYYY-MM-DD key.
 *
 * Uses the browser's local timezone to determine the calendar date,
 * ensuring consistency with how dates are displayed in the runs list.
 *
 * @param isoTimestamp - ISO 8601 timestamp string
 * @returns Local calendar date in YYYY-MM-DD format
 */
export function localDateKey(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
