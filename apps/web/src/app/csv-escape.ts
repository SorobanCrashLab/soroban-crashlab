/**
 * RFC-4180 compliant CSV field escaping.
 *
 * Implements the standard CSV escaping rules:
 * - Fields containing comma, double-quote, or newline/carriage return must be wrapped in double quotes
 * - Any double-quote character within the field must be escaped by doubling it ("")
 * - Empty fields remain truly empty (no quotes needed unless they would otherwise be interpreted as multiple fields)
 *
 * Reference: https://tools.ietf.org/html/rfc4180
 */

/**
 * Escapes a CSV field value according to RFC-4180.
 *
 * @param value - The field value to escape (any type will be coerced to string)
 * @returns The escaped field value, ready to be included in CSV output
 *
 * @example
 * csvEscape('hello');                    // "hello"
 * csvEscape('hello, world');             // '"hello, world"'
 * csvEscape('say "hi"');                 // '"say ""hi"""'
 * csvEscape('line1\nline2');             // '"line1\nline2"'
 * csvEscape('');                         // ""
 */
export function csvEscape(value: string | number): string {
  const str = String(value);

  // Check if the field needs escaping
  const needsEscaping = /[,"\r\n]/.test(str);

  if (!needsEscaping) {
    return str;
  }

  // Escape internal quotes by doubling them, then wrap in quotes
  return `"${str.replace(/"/g, '""')}"`;
}
