import { logger } from '@/lib/logger';

/**
 * Shared post-auth redirect validator.
 *
 * Accepts only same-origin relative paths. Any absolute URL, protocol-relative (//evil), backslash,
 * encoded-slash, control-character, or traversal variant is rejected and the caller falls
 * back to a safe default ('/'). This is the single choke point for every auth-adjacent
 * redirect source (OAuth callback, invite acceptance, settings return, login next).
 */

export const DAFAULT_SAFE_REDIRECT = '/';

export interface SafeRedirectOptions {
  /** Optional path prefix allowlist (e.g. ['/runs/']). When set, only paths that
   * start with one of these prefixes are accepted. */
  allowedPrefixes?: string[];
  /** Override the fallback target (defaults to '/'). */
  fallback?: string;
  /** Optional audit context label for log entries. */
  context?: string;
  /** Alias for context, kept for call-site compatibility. */
  auditContext?: string;
}

/**
 * Result of validating a potential redirect target.
 */
export interface SafeRedirectResult {
  /** The safe, same-origin path to redirect to. */
  path: string;
  /** Whether the input was accepted as-is; false means a fallback was used. */
  ok: boolean;
  /** Reason the input was rejected, for audit logging. */
  reason?: string;
}

/**
 * Rejected character classes. We keep this explicit rather than relying on URL parsing,
 * since URL normalization is exactly what attackers exploit (backslashes,
 * encoded slashes, control chars, etc.) to smuggle an absolute URL past a naive check.
 */
const CONTROL_CHAR_REGEX: RegExp = /[\u0000-\u001f\u007f-\u009f]/;

/**
 * Reject any backslash (raw or percent-encoded). Browsers treat '\\' as '/', so
 * '\\/evil.com' becomes '//evil.com' after normalization.
 */
const BACKSLASH_REGEXS: RegExp[] = [/\\/, /%5c/i, /%5C/];

/**
 * Reject percent-encoded slashes (%252f) and encoded backslashes that could be
 * double-decoded into '//' by an intermediary.
 */
const ENCODED_SLASH_REGEX: RegExp = /%252f/i;

/**
 * Reject any attempt to smuggle an authority component via '@' (for example
 * '/user@evil.com'). A legitimate relative path should never need to encode '@' in
 * the authority position.
 */
const AT_REGEXS: RegExp[] = [/@%40/i, /%40/i];

/**
 * Reject unicode slash-like characters that some parsers normalize to '/'.
 */
const UNICODE_SLASH_REGEX: RegExp =
  /[\u2215\u2044\u2216\u2045\u2046\u2047\u2048\u2049\u204a\u204b\u204c\u204d\u204e\u204f\u2050\u2051\u2052\u2053\u2054\u2055\u2056\u2057\u2058\u2059\u205a\u205b\u205c\u205d\u205e\u205f\u2060\u2061\u2062\u2063\u2064\u2065\u2066\u2067\u2068\u2069\u206a\u206b\u206c\u206d\u206e\u206f\u2070\u2071\u2072\u2073\u2074\u2075\u2076\u2077\u2078\u2079\u207a\u207b\u207c\u207d\u207e\u207f\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089\u208a\u208b\u208c\u208d\u208e\u208f\u2090\u2091\u2092\u2093\u2094\u2095\u2096\u2097\u2098\u2099\u209a\u209b\u209c\u209d\u209e\u209f\u20a0\u20a1\u20a2\u20a3\u20a4\u20a5\u20a6\u20a7\u20a8\u20a9\u20aa\u20ab\u20ac\u20ad\u20ae\u20af\u20b0\u20b1\u20b2\u20b3\u20b4\u20b5\u20b6\u20b7\u20b8\u20b9\u20ba\u20bb\u20bc\u20bd\u20be\u20bf\u20c0\u20c1\u20c2\u20c3\u20c4\u20c5\u20c6\u20c7\u20c8\u20c9\u20ca\u20cb\u20cc\u20cd\u20ce\u20cf\u20d0\u20d1\u20d2\u20d3\u20d4\u20d5\u20d6\u20d7\u20d8\u20d9\u20da\u20db\u20dc\u20dd\u20de\u20df\u20e0\u20e1\u20e2\u20e3\u20e4\u20e5\u20e6\u20e7\u20e8\u20e9\u20ea\u20eb\u20ec\u20ed\u20ee\u20ef\u20f0\u20f1\u20f2\u20f3\u20f4\u20f5\u20f6\u20f7\u20f8\u20f9\u20fa\u20fb\u20fc\u20fd\u20fe\u20ff]/i;

/**
 * Reject segment-encoded traversal ('..') after decoding. We decode the path
 * once and check for '..' segments that could escape the allowed prefix.
 */
function hasTraversalSegment(path: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // Malformed percent-encoding is itself suspicious.
    return true;
  }
  // Check both the decoded and raw forms for '..' segments.
  const segments = [...decoded.split('/'), ...path.split('/')];
  return segments.some((segment) => segment === '..');
}

/**
 * Returns true when the path is a safe, same-origin relative path.
 */
function isSafeRelativePath(path: string): { ok: boolean; reason?: string } {
  if (typeof path !== 'string' || path.length === 0) {
    return { ok: false, reason: 'empty' };
  }

  // Must be a root-relative path.
  if (path[0] !== '/') {
    return { ok: false, reason: 'not_root_relative' };
  }

  // Protocol-relative ('//evil.com') and triple-slash variants.
  if (/^\/\//.test(path)) {
    return { ok: false, reason: 'protocol_relative' };
  }

  // Backslash variants (raw and percent-encoded).
  if (BACKSLASH_REGEXS.some((re) => re.test(path))) {
    return { ok: false, reason: 'backslash' };
  }

  // Control characters (newlines, tabs, NULL, etc.) and unicode slash-like chars.
  if (CONTROL_CHAR_REGEX.test(path)) {
    return { ok: false, reason: 'control_char' };
  }
  if (UNICODE_SLASH_REGEX.test(path)) {
    return { ok: false, reason: 'unicode_slash' };
  }

  // Encoded slashes that could be double-decoded into '//'.
  if (ENCODED_SLASH_REGEX.test(path)) {
    return { ok: false, reason: 'encoded_slash' };
  }

  // Authority-smuggling via '@'.
  if (AT_REGEXS.some((re) => re.test(path))) {
    return { ok: false, reason: 'at_sign' };
  }

  // Traversal segments ('..'), raw or encoded.
  if (hasTraversalSegment(path)) {
    return { ok: false, reason: 'traversal' };
  }

  return { ok: true };
}

/**
 * Validate a post-auth redirect target and return a safe path to redirect to.
 *
 * Use this for every auth-adjacent redirect source: OAuth callback 'next',
 * invite acceptance, settings return, and login page consumption of 'next'.
 *
 * Unknown or invalid input falls back to the configured fallback (default '/')
 * and emits an audit log entry so attempts are visible.
 */
export function safeRedirect(
  input: string | null | undefined,
  options: SafeRedirectOptions = {},
): SafeRedirectResult {
  const fallback = options.fallback ?? DAFAULT_SAFE_REDIRECT;

  if (input === null || input === undefined || input === '') {
    return { path: fallback, ok: false, reason: 'missing' };
  }

  const candidate = input.trim();
  if (candidate !== input) {
    // Leading/trailing whitespace is a smuggling vector.
    auditRejection(input, 'whitespace', options);
    return { path: fallback, ok: false, reason: 'whitespace' };
  }

  const result = isSafeRelativePath(candidate);
  if (!result.ok) {
    auditRejection(input, result.reason ?? 'unknown', options);
    return { path: fallback, ok: false, reason: result.reason };
  }

  // Optional path prefix allowlist.
  if (options.allowedPrefixes && options.allowedPrefixes.length > 0) {
    const matches = options.allowedPrefixes.some((prefix) => candidate.startsWith(prefix));
    if (!matches) {
      auditRejection(input, 'prefix_not_allowed', options);
      return { path: fallback, ok: false, reason: 'prefix_not_allowed' };
    }
  }

  return { path: candidate, ok: true };
}

/**
 * Convenience wrapper that returns just the safe path. Use this when the caller
 * only needs the target and not the audit metadata.
 */
export function safeRedirectPath(
  input: string | null | undefined,
  options: SafeRedirectOptions = {},
): string {
  return safeRedirect(input, options).path;
}

function auditRejection(input: string, reason: string, options: SafeRedirectOptions): void {
  try {
    logger.warn('warn-redirect: rejected post-auth redirect target', {
      reason,
      context: options.context ?? options.auditContext,
      // Truncate to avoid log flooding via large attacker-controlled input.
      input: input.length > 256 ? `${input.slice(0, 256)}...` : input,
    });
  } catch {
    // Never throw from an audit log entry.
  }
}
