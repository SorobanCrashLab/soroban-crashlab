/**
 * Redaction rules for audit entries (#1431).
 *
 * An audit log is only safe to keep forever if it never becomes the place a
 * secret leaked to. Metadata is filtered on the way in — at the append
 * chokepoint, not at render time — so a redaction bug cannot be undone by
 * reading the log a different way.
 */

/** Keys whose values never appear in the log, matched case-insensitively. */
const SECRET_KEY_PATTERN =
  /(secret|password|passwd|token|api[-_]?key|access[-_]?key|authorization|credential|private[-_]?key|cookie|session)/i;

/** Keys that carry personal data we have no reason to retain. */
const PII_KEY_PATTERN = /(email|phone|ssn|address|full[-_]?name|ip[-_]?address)/i;

export const REDACTED = '[redacted]';

/** How much of a token is kept so an entry is still identifiable. */
export const TOKEN_PREFIX_LENGTH = 6;

/**
 * Tokens keep a short prefix — enough to correlate with the credential that
 * was revoked, far too little to use.
 */
export function redactTokenLike(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= TOKEN_PREFIX_LENGTH) return REDACTED;
  return `${trimmed.slice(0, TOKEN_PREFIX_LENGTH)}…${REDACTED}`;
}

/** Strips the query string and any credentials from a URL. */
export function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return value;
  }
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Recursively redacts a metadata object. Unknown shapes are handled
 * conservatively: anything that is not a primitive, array, or plain object is
 * dropped rather than stringified into the log.
 */
export function redactMetadata(value: unknown, depth = 0): unknown {
  if (depth > 6) return REDACTED;

  if (typeof value === 'string') {
    return looksLikeUrl(value) ? redactUrl(value) : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactMetadata(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const entry = source[key];
      if (SECRET_KEY_PATTERN.test(key)) {
        output[key] = typeof entry === 'string' ? redactTokenLike(entry) : REDACTED;
        continue;
      }
      if (PII_KEY_PATTERN.test(key)) {
        output[key] = REDACTED;
        continue;
      }
      output[key] = redactMetadata(entry, depth + 1);
    }
    return output;
  }

  return undefined;
}
