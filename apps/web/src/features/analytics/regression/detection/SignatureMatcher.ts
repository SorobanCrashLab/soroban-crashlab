/** Crash signature fuzzy matching (#2207). */

/** Normalize a signature: lowercase, drop volatile hex ids and whitespace. */
export function normalizeSignature(signature: string): string {
  return signature
    .toLowerCase()
    .replace(/0x[0-9a-f]+/g, '0x')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Levenshtein-based similarity in [0, 1]. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_v, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

/** Fuzzy match two signatures using a configurable threshold (default 0.9). */
export function signaturesMatch(a: string, b: string, threshold = 0.9): boolean {
  return similarity(normalizeSignature(a), normalizeSignature(b)) >= threshold;
}
