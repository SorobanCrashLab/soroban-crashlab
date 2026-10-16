import { ApiError } from './api-client';
import { HttpError } from './request-dedup';

// ---------------------------------------------------------------------------
// Integrity error types (#1885)
// ---------------------------------------------------------------------------

/**
 * Thrown when an artifact or snapshot fails checksum verification.
 * Callers should block destructive operations (e.g. replay) and surface the
 * IntegrityBadge with severity="corrupt".
 */
export class IntegrityError extends Error {
  readonly kind: 'corrupt' | 'degraded' | 'verify_failed';
  readonly artifactId?: string;

  constructor(
    kind: IntegrityError['kind'],
    message: string,
    artifactId?: string,
  ) {
    super(message);
    this.name = 'IntegrityError';
    this.kind = kind;
    this.artifactId = artifactId;
  }
}

/**
 * Maps an integrity `kind` to a user-visible severity string that drives the
 * `IntegrityBadge` and `DegradedStorageBanner` components.
 */
export function integrityKindToSeverity(
  kind: IntegrityError['kind'],
): 'corrupt' | 'degraded' {
  return kind === 'corrupt' || kind === 'verify_failed' ? 'corrupt' : 'degraded';
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Sanitizes URLs, internal hostnames, and IP addresses out of text strings.
 */
function sanitizeMessage(text: string): string {
  return text
    .replace(/https?:\/\/[^\s/$.?#].[^\s]*/gi, '[server]')
    .replace(/localhost:\d+/gi, '[server]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/gi, '[server]');
}

/**
 * Centralized error-to-user-message mapper (#1381).
 * Maps raw exceptions and API errors to safe, user-friendly messages per error class.
 * Internal URLs, raw stack traces, and topology details are never exposed to end users.
 */
export function toUserMessage(err: unknown, defaultMessage?: string): string {
  // Integrity errors (#1885) — surface specific copy so users know to re-upload.
  if (err instanceof IntegrityError) {
    if (err.kind === 'corrupt' || err.kind === 'verify_failed') {
      return 'Data integrity check failed. This artifact may be corrupted — please re-upload or contact support.';
    }
    if (err.kind === 'degraded') {
      return 'Storage is currently degraded. Data may be incomplete. Please try again shortly.';
    }
  }

  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) {
      return 'Authentication required or access denied. Please verify your permissions.';
    }
    if (err.status === 400 || err.status === 422) {
      return 'Invalid request data. Please check your input and try again.';
    }
    if (err.status >= 500) {
      return 'Server error encountered. Please try again later.';
    }
  }

  if (err instanceof HttpError) {
    if (err.status === 401 || err.status === 403) {
      return 'Authentication required or access denied. Please verify your permissions.';
    }
    if (err.status === 400 || err.status === 422) {
      return 'Invalid request data. Please check your input and try again.';
    }
    if (err.status >= 500) {
      return 'Server error encountered. Please try again later.';
    }
  }

  const rawMessage = err instanceof Error ? err.message : String(err ?? '');
  const lower = rawMessage.toLowerCase();

  if (
    err instanceof TypeError ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('econnrefused') ||
    lower.includes('fetch failed') ||
    lower.includes('network error')
  ) {
    return 'Unable to connect to the server. Please check your network connection and try again.';
  }

  if (
    lower.includes('unauthorized') ||
    lower.includes('forbidden') ||
    lower.includes('access denied')
  ) {
    return 'Authentication required or access denied. Please verify your permissions.';
  }

  if (lower.includes('validation') || lower.includes('invalid')) {
    return 'Invalid request data. Please check your input and try again.';
  }

  if (
    lower.includes('server error') ||
    lower.includes('internal error') ||
    lower.includes('500') ||
    lower.includes('502') ||
    lower.includes('503')
  ) {
    return 'Server error encountered. Please try again later.';
  }

  if (
    lower.includes('integrity') ||
    lower.includes('checksum') ||
    lower.includes('corrupt') ||
    lower.includes('verify failed')
  ) {
    return 'Data integrity check failed. This artifact may be corrupted — please re-upload or contact support.';
  }

  if (defaultMessage) {
    return sanitizeMessage(defaultMessage);
  }

  return 'An unexpected error occurred. Please try again.';
}
