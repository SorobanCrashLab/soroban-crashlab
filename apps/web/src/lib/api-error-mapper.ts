import { ApiError } from './api-client';
import { HttpError } from './request-dedup';

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

  if (defaultMessage) {
    return sanitizeMessage(defaultMessage);
  }

  return 'An unexpected error occurred. Please try again.';
}
