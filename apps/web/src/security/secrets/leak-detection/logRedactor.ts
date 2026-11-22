const SENSITIVE_KEY = /^(authorization|cookie|set-cookie|password|secret|token|api[-_]?key|client[-_]?secret)$/i;

export function redactLogValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactLogValue);

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactLogValue(child),
      ]),
    );
  }

  if (typeof value === 'string') {
    return value
      .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
      .replace(
        /\b(api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"'\s,]+/gi,
        '$1=[REDACTED]',
      );
  }

  return value;
}
