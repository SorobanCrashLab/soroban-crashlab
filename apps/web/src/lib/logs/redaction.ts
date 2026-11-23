/**
 * Redaction policy for structured logs (#022/#070/#075).
 *
 * The server applies this before events leave the API. The UI applies the same
 * helper to any locally generated/demo events and uses `canViewSensitiveLogs`
 * to decide whether a "reveal" affordance is even offered. Sensitive values
 * are never shipped to a viewer who cannot see them.
 */

import type { LogEvent } from './types';

export type LogViewerRole = 'viewer' | 'responder' | 'analyst' | 'maintainer' | string;

export interface LogAccessContext {
  role?: LogViewerRole | null;
  canSeeSensitive?: boolean;
}

export const REDACTED_MARKER = '[REDACTED]';

const SENSITIVE_KEY = /(authorization|token|secret|password|passwd|cookie|api[_-]?key|private[_-]?key|credential|seed_material|session_id)/i;
const SENSITIVE_TEXT = [
  /(Bearer\s+)[A-Za-z0-9._\-+/=]+/gi,
  /(token|secret|password|api[_-]?key|authorization)\s*[:=]\s*("[^"]+"|'[^']+'|[^\s,;]+)/gi,
  /\b(sk|pk)-[A-Za-z0-9]{16,}\b/g,
];

/** Only maintainers may see sensitive log fields. */
export function canViewSensitiveLogs(access: LogAccessContext): boolean {
  return access.canSeeSensitive === true || access.role === 'maintainer';
}

/** Return attribute paths that look sensitive. */
export function findSensitiveFields(event: LogEvent): string[] {
  const paths = Object.keys(event.attributes)
    .filter((key) => SENSITIVE_KEY.test(key))
    .map((key) => `attributes.${key}`);
  const hasSensitiveText = SENSITIVE_TEXT.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(event.message);
  });
  // RegExp with /g keeps lastIndex; reset explicitly so repeated calls agree.
  SENSITIVE_TEXT.forEach((pattern) => { pattern.lastIndex = 0; });
  if (hasSensitiveText) paths.push('message');
  return paths;
}

function redactMessage(message: string): string {
  return message
    .replace(/(Bearer\s+)[A-Za-z0-9._\-+/=]+/gi, `$1${REDACTED_MARKER}`)
    .replace(
      /(token|secret|password|api[_-]?key|authorization)(\s*[:=]\s*)(?:"[^"]+"|'[^']+'|[^\s,;]+)/gi,
      `$1$2${REDACTED_MARKER}`,
    )
    .replace(/\b(sk|pk)-[A-Za-z0-9]{16,}\b/g, (_match, prefix: string) => `${prefix}-${REDACTED_MARKER}`);
}

/**
 * Produce a safe copy of an event for the caller's access level.
 * The original object is never mutated.
 */
export function redactLogEvent(event: LogEvent, access: LogAccessContext): LogEvent {
  const sensitiveFields = findSensitiveFields(event);
  if (sensitiveFields.length === 0) return { ...event, redacted: [] };

  if (canViewSensitiveLogs(access)) {
    return { ...event, redacted: [], sensitiveFields };
  }

  const attributes = { ...event.attributes };
  const redacted: string[] = [];
  for (const key of Object.keys(attributes)) {
    if (SENSITIVE_KEY.test(key)) {
      attributes[key] = REDACTED_MARKER;
      redacted.push(`attributes.${key}`);
    }
  }
  const message = redactMessage(event.message);
  if (message !== event.message) redacted.push('message');

  return { ...event, attributes, message, redacted, sensitiveFields };
}

export function redactLogEvents(events: LogEvent[], access: LogAccessContext): LogEvent[] {
  return events.map((event) => redactLogEvent(event, access));
}

/** Human-readable explanation used in the UI for a redacted field. */
export function redactionNotice(event: LogEvent, path: string): string {
  return `${path} hidden by log redaction policy${event.sensitiveFields?.length ? ` (${event.sensitiveFields.length} sensitive field${event.sensitiveFields.length === 1 ? '' : 's'})` : ''}`;
}
