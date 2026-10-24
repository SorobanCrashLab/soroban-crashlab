const SENSITIVE_FIELD = /(?:authorization|auth[_-]?token|access[_-]?token|refresh[_-]?token|api[_-]?key|webhook[_-]?key|password|secret|cookie|private[_-]?key|mnemonic|seed[_-]?phrase)/i;

const INLINE_SECRET_PATTERNS = [
  /\b(?:sk_(?:live|test)_|rk_(?:live|test)_|gh[pousr]_|xox[baprs]-)[A-Za-z0-9_-]{8,}\b/gi,
  /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi,
  /((?:authorization|auth[_-]?token|access[_-]?token|refresh[_-]?token|api[_-]?key|webhook[_-]?key|password|secret|cookie)\s*["']?\s*[:=]\s*["']?)((?:Bearer\s+)?[^"'\s,;}&]+)/gi,
];

export function redactText(value: string): string {
  return INLINE_SECRET_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, (_match, prefix?: string) => `${prefix ?? ''}[REDACTED]`),
    value,
  );
}

export function redactValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactText(value);
  if (typeof value !== 'object' || value === null) return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (value instanceof Error) {
    return {
      name: redactText(value.name),
      message: redactText(value.message),
      ...(value.stack ? { stack: redactText(value.stack) } : {}),
    };
  }
  if (Array.isArray(value)) return value.map((item) => redactValue(item, seen));

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SENSITIVE_FIELD.test(key) ? '[REDACTED]' : redactValue(item, seen);
  }
  return result;
}

/** Redacts JSON fields and inline credentials while preserving valid JSON when possible. */
export function redactArtifactText(value: string): string {
  try {
    const parsed: unknown = JSON.parse(value);
    return JSON.stringify(redactValue(parsed));
  } catch {
    return redactText(value);
  }
}

export function containsSensitiveContent(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value);
    return JSON.stringify(redactValue(parsed)) !== JSON.stringify(parsed);
  } catch {
    return redactText(value) !== value;
  }
}
