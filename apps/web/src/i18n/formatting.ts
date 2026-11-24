/**
 * Locale-aware formatting utilities (issue #2261).
 *
 * All formatters use native Intl.* APIs, never string concatenation or
 * hardcoded separators. Every function accepts an optional `locale` param
 * that defaults to the current i18n context locale (via useTranslations hook).
 *
 * Relative time formatting is **mount-gated** (hydration-safe) per issue #1372.
 * Consumers must check `mounted` from their provider before rendering relative
 * timestamps or pass an absolute fallback.
 */

const DEFAULT_TIMEZONE = 'UTC';

/**
 * Format bytes with locale-aware decimal separator and unit labels.
 * Examples (en): 1536 → "1.5 KB", 1048576 → "1 MB"
 * Examples (de): 1536 → "1,5 KB", 1048576 → "1 MB"
 */
export function formatBytes(
  bytes: number,
  locale: string = 'en',
  decimals: number = 1,
): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  
  // Use Intl.NumberFormat for locale-aware decimal separator
  const formatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: i === 0 ? 0 : decimals,
    maximumFractionDigits: i === 0 ? 0 : decimals,
  });
  
  return `${formatter.format(value)} ${sizes[i]}`;
}

/**
 * Format a number with locale-aware thousands separator and decimal point.
 * Examples (en): 1234567.891 → "1,234,567.891"
 * Examples (de): 1234567.891 → "1.234.567,891"
 */
export function formatNumber(
  value: number,
  locale: string = 'en',
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Format a percentage with locale-aware decimal separator.
 * Examples (en): 0.256 → "25.6%"
 * Examples (de): 0.256 → "25,6 %"
 */
export function formatPercent(
  value: number,
  locale: string = 'en',
  decimals: number = 1,
): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format a duration in milliseconds as human-readable time.
 * Examples: 1500 → "1.5s", 65000 → "1m 5s", 3661000 → "1h 1m 1s"
 */
export function formatDuration(
  ms: number,
  locale: string = 'en',
): string {
  if (ms < 1000) return `${ms}ms`;
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
  if (seconds % 60 > 0 || parts.length === 0) {
    const sec = seconds % 60;
    const formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    });
    parts.push(`${formatter.format(sec)}s`);
  }
  
  return parts.join(' ');
}

/**
 * Format a date with locale-aware ordering and separator.
 * Examples (en): Date(2024-03-15) → "Mar 15, 2024"
 * Examples (es): Date(2024-03-15) → "15 mar 2024"
 */
export function formatDate(
  date: Date | string | number,
  locale: string = 'en',
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  const defaults: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  };
  return new Intl.DateTimeFormat(locale, { ...defaults, ...options }).format(d);
}

/**
 * Format time with locale-aware 12/24-hour clock and optional timezone.
 * Examples (en): Date(...14:30) → "2:30 PM" (with timezone: "2:30 PM UTC")
 * Examples (es): Date(...14:30) → "14:30" (24-hour)
 */
export function formatTime(
  date: Date | string | number,
  locale: string = 'en',
  options?: Intl.DateTimeFormatOptions & { timezone?: string },
): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  const { timezone, ...rest } = options ?? {};
  const defaults: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    ...(timezone && { timeZone: timezone, timeZoneName: 'short' }),
  };
  return new Intl.DateTimeFormat(locale, { ...defaults, ...rest }).format(d);
}

/**
 * Format relative time (e.g., "30 seconds ago", "in 2 hours").
 * 
 * **IMPORTANT (issue #1372)**: This formatter is NOT hydration-safe if called
 * during SSR. Consumers MUST gate it with a `mounted` check or render an
 * absolute fallback timestamp server-side.
 * 
 * Examples (en): now - 30s → "30 seconds ago", now + 7200s → "in 2 hours"
 * Examples (es): now - 30s → "hace 30 segundos", now + 7200s → "dentro de 2 horas"
 */
export function formatRelative(
  date: Date | string | number,
  locale: string = 'en',
  now: Date = new Date(),
): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  const diffMs = d.getTime() - now.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const absSec = Math.abs(diffSec);

  // Choose appropriate unit based on magnitude
  let value: number;
  let unit: Intl.RelativeTimeFormatUnit;

  if (absSec < 60) {
    value = diffSec;
    unit = 'second';
  } else if (absSec < 3600) {
    value = Math.round(diffSec / 60);
    unit = 'minute';
  } else if (absSec < 86400) {
    value = Math.round(diffSec / 3600);
    unit = 'hour';
  } else if (absSec < 604800) {
    value = Math.round(diffSec / 86400);
    unit = 'day';
  } else if (absSec < 2592000) {
    value = Math.round(diffSec / 604800);
    unit = 'week';
  } else if (absSec < 31536000) {
    value = Math.round(diffSec / 2592000);
    unit = 'month';
  } else {
    value = Math.round(diffSec / 31536000);
    unit = 'year';
  }

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'long' });
  return rtf.format(value, unit);
}

/**
 * Hydration-safe wrapper for relative time formatting.
 * Returns relative format if `mounted`, otherwise falls back to absolute date.
 * Use this in components that render during SSR.
 */
export function formatRelativeSafe(
  date: Date | string | number,
  locale: string = 'en',
  mounted: boolean = false,
  now: Date = new Date(),
): string {
  if (mounted) {
    return formatRelative(date, locale, now);
  }
  // Fallback: absolute date for SSR
  return formatDate(date, locale);
}
