/**
 * utils/datetime — single source of truth for all timestamp formatting.
 *
 * Exported vocabulary:
 *   absoluteShort  "Aug 12, 2026, 3:45 PM"          (medium date + short time)
 *   absoluteLong   "August 12, 2026 at 3:45:22 PM"  (long date + medium time)
 *   relative       "just now" | "5m ago" | "3h ago" | "2d ago" | date string
 *   isoDate        "2026-08-12"                      (YYYY-MM-DD, timezone-aware)
 *   timeOnly       "3:45 PM"                         (short time only)
 *
 * All formatters accept:
 *   value     — Date | string | number  (ISO string or epoch ms)
 *   timeZone  — optional IANA tz string (e.g. "UTC", "America/New_York")
 *               Defaults to the viewer's local timezone.
 *
 * Relative buckets (stable, no future-tense):
 *   < 60s  → "just now"
 *   < 60m  → "Nm ago"
 *   < 24h  → "Nh ago"
 *   < 30d  → "Nd ago"
 *   else   → absoluteShort
 */

export type DateInput = Date | string | number;

function toDate(value: DateInput): Date {
  if (value instanceof Date) return value;
  return new Date(value);
}

/**
 * absoluteShort — e.g. "Aug 12, 2026, 3:45 PM"
 */
export function absoluteShort(value: DateInput, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...(timeZone ? { timeZone } : {}),
    }).format(toDate(value));
  } catch {
    return String(value);
  }
}

/**
 * absoluteLong — e.g. "August 12, 2026 at 3:45:22 PM"
 */
export function absoluteLong(value: DateInput, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'long',
      timeStyle: 'medium',
      ...(timeZone ? { timeZone } : {}),
    }).format(toDate(value));
  } catch {
    return String(value);
  }
}

/**
 * relative — human-friendly relative time, always past-tense.
 * Falls back to absoluteShort for dates older than 30 days.
 *
 * @param now  Optional reference time (injection point for tests).
 */
export function relative(
  value: DateInput,
  timeZone?: string,
  now?: DateInput,
): string {
  try {
    const date = toDate(value);
    const reference = now ? toDate(now) : new Date();
    const diffMs = reference.getTime() - date.getTime();

    if (diffMs < 0) {
      // Don't produce future-tense strings — show absolute instead.
      return absoluteShort(value, timeZone);
    }

    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHrs = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHrs / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;
    return absoluteShort(value, timeZone);
  } catch {
    return String(value);
  }
}

/**
 * isoDate — e.g. "2026-08-12" (YYYY-MM-DD).
 * Timezone-aware: pass timeZone to get the date in a specific zone.
 */
export function isoDate(value: DateInput, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...(timeZone ? { timeZone } : {}),
    }).format(toDate(value));
  } catch {
    return String(value);
  }
}

/**
 * timeOnly — e.g. "3:45 PM"
 */
export function timeOnly(value: DateInput, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeStyle: 'short',
      ...(timeZone ? { timeZone } : {}),
    }).format(toDate(value));
  } catch {
    return String(value);
  }
}
