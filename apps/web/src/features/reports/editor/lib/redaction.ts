/**
 * Secret redaction for exported reports. Patterns are deliberately specific:
 * we want to strip credentials without mangling ordinary Stack traces or
 * transaction hashes.
 */
import type { EntitySnapshot } from './types';

const REDACTED = '[REDACTED]';

const PATTERNS: ReadonlyArray<{ pattern: RegExp; replacement: string | ((match: string) => string) }> = [
  {
    pattern: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]+ )?PRIVATE KEY-----/g,
    replacement: '[REDACTED PRIVATE KEY]',
  },
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, replacement: `Bearer ${REDACTED}` },
  { pattern: /\b(?:sk|rk)-[A-Za-z0-9_-]{16,}\b/g, replacement: REDACTED },
  { pattern: /\bS[A-Z2-7]{55}\b/g, replacement: REDACTED },
  {
    pattern: /([?&](?:token|key|auth|session|code|sig|api_key)=)[^&\s"']+/gi,
    replacement: (_match: string) => `${_match.split(/=(.*)/s)[0]}=${REDACTED}`,
  },
  {
    // URL query parameters are handled by the pattern above, which keeps the
    // parameter name (`?token=[REDACTED]`) for actionable export output.
    pattern: /(?<![?&])\b(api[_-]?key|secret|token|password|passwd|authorization)(\s*[:=]\s*)(['"]?)[^\s'"&,;]+/gi,
    // Drop the key as well as the value: callers use [REDACTED] as an opaque
    // placeholder in generated labels and export titles.
    replacement: () => REDACTED,
  },
];

export function redactSecrets(text: string): string {
  let result = text;
  for (const { pattern, replacement } of PATTERNS) {
    result = result.replace(pattern, replacement as never);
  }
  return result;
}

export function redactSnapshot(snapshot: EntitySnapshot): EntitySnapshot {
  return {
    ...snapshot,
    title: redactSecrets(snapshot.title),
    status: redactSecrets(snapshot.status),
    summary: redactSecrets(snapshot.summary),
    sourceUrl: redactSecrets(snapshot.sourceUrl),
    fields: snapshot.fields
      ? Object.fromEntries(
          Object.entries(snapshot.fields).map(([key, value]) => [
            key,
            typeof value === 'string' ? redactSecrets(value) : value,
          ]),
        )
      : undefined,
  };
}
