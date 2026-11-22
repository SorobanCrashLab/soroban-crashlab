import * as assert from 'node:assert/strict';
import { csvEscape } from './csv-escape';

/**
 * Test suite for RFC-4180 compliant CSV escaping.
 * Ensures that fields with commas, quotes, newlines, and other edge cases
 * round-trip correctly through CSV parsing.
 */

// ──────────────────────────────────────────────────────────────
// Basic cases (no escaping needed)
// ──────────────────────────────────────────────────────────────

assert.equal(csvEscape('hello'), 'hello', 'plain text should be unchanged');
assert.equal(csvEscape('simple'), 'simple');
assert.equal(csvEscape('test123'), 'test123');

// Numeric values
assert.equal(csvEscape(42), '42', 'numeric value should be converted to string');
assert.equal(csvEscape(3.14), '3.14');
assert.equal(csvEscape(0), '0');

// Empty string
assert.equal(csvEscape(''), '', 'empty string should remain empty');

// ──────────────────────────────────────────────────────────────
// Fields with commas (most common case in crash annotations)
// ──────────────────────────────────────────────────────────────

assert.equal(csvEscape('hello, world'), '"hello, world"', 'field with comma should be quoted');
assert.equal(csvEscape('a,b,c'), '"a,b,c"');
assert.equal(csvEscape(',value'), '",value"', 'leading comma should trigger quoting');
assert.equal(csvEscape('value,'), '"value,"', 'trailing comma should trigger quoting');
assert.equal(csvEscape('a,b,c,d'), '"a,b,c,d"');

// ──────────────────────────────────────────────────────────────
// Fields with double quotes
// ──────────────────────────────────────────────────────────────

assert.equal(csvEscape('say "hi"'), '"say ""hi"""', 'quotes should be doubled');
assert.equal(csvEscape('"quoted"'), '"""quoted"""');
assert.equal(csvEscape('"value'), '"""value"', 'leading quote should trigger quoting');
assert.equal(csvEscape('value"'), '"value"""', 'trailing quote should trigger quoting');
assert.equal(
  csvEscape('"a""b""c"'),
  '"""a""""b""""c"""',
  'multiple quotes should all be doubled'
);

// ──────────────────────────────────────────────────────────────
// Fields with newlines and carriage returns
// ──────────────────────────────────────────────────────────────

assert.equal(csvEscape('line1\nline2'), '"line1\nline2"', 'newline should trigger quoting');
assert.equal(csvEscape('line1\rline2'), '"line1\rline2"', 'carriage return should trigger quoting');
assert.equal(csvEscape('line1\r\nline2'), '"line1\r\nline2"', 'CRLF should trigger quoting');

// ──────────────────────────────────────────────────────────────
// Hostile / adversarial cases (real crash annotation examples)
// ──────────────────────────────────────────────────────────────

const annotation = 'Auth error: "invalid signature", see logs for details';
const escapedAnnotation = csvEscape(annotation);
assert.equal(
  escapedAnnotation,
  '"Auth error: ""invalid signature"", see logs for details"',
  'crash annotation with commas and quotes should be properly escaped'
);

const output = 'Error in contract:\nLine 42: Authorization failed\nContext: "auth_check"';
const escapedOutput = csvEscape(output);
assert.equal(
  escapedOutput,
  '"Error in contract:\nLine 42: Authorization failed\nContext: ""auth_check"""',
  'multi-line crash output should be properly escaped'
);

const sqlLike = 'payload", "dummy"; DROP TABLE';
const escapedSql = csvEscape(sqlLike);
assert.equal(escapedSql, '"payload"", ""dummy""; DROP TABLE"', 'SQL-like injection should be escaped');

const json = '{"error": "amount must be > 0", "code": "INVALID_AMOUNT"}';
const escapedJson = csvEscape(json);
// The JSON string contains quotes, so they all get doubled when wrapping in quotes
const expectedJson = '"{""error"": ""amount must be > 0"", ""code"": ""INVALID_AMOUNT""}"';
assert.equal(
  escapedJson,
  expectedJson,
  'JSON with special characters should be escaped'
);

// ──────────────────────────────────────────────────────────────
// Round-trip parsing verification
// ──────────────────────────────────────────────────────────────

function parseCSVRow(row: string): string[] {
  // Simple CSV parser for verification (not production-grade)
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];

    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  fields.push(current);
  return fields;
}

// Test round-trip for comma in field
const value1 = 'hello, world';
const escaped1 = csvEscape(value1);
const row1 = `${escaped1},next_field`;
const fields1 = parseCSVRow(row1);
assert.equal(fields1.length, 2, 'should have 2 fields');
assert.equal(fields1[0], value1, 'comma in field should round-trip');
assert.equal(fields1[1], 'next_field');

// Test round-trip for quotes in field
const value2 = 'say "hi"';
const escaped2 = csvEscape(value2);
const row2 = `${escaped2},next_field`;
const fields2 = parseCSVRow(row2);
assert.equal(fields2.length, 2);
assert.equal(fields2[0], value2, 'quotes in field should round-trip');
assert.equal(fields2[1], 'next_field');

// Test round-trip for newlines in field
const value3 = 'line1\nline2';
const escaped3 = csvEscape(value3);
const row3 = `${escaped3},next_field`;
const fields3 = parseCSVRow(row3);
assert.equal(fields3.length, 2);
assert.equal(fields3[0], value3, 'newlines in field should round-trip');
assert.equal(fields3[1], 'next_field');

// Test round-trip for complex case
const value4 = 'Error: "invalid", line2\nmore info';
const escaped4 = csvEscape(value4);
const row4 = `${escaped4},next_field,final`;
const fields4 = parseCSVRow(row4);
assert.equal(fields4.length, 3, 'should have 3 fields');
assert.equal(fields4[0], value4, 'complex case should round-trip');
assert.equal(fields4[1], 'next_field');
assert.equal(fields4[2], 'final');

// ──────────────────────────────────────────────────────────────
// Edge cases with leading/trailing spaces
// ──────────────────────────────────────────────────────────────

assert.equal(csvEscape('  hello'), '  hello', 'leading spaces should be preserved');
assert.equal(csvEscape('hello  '), 'hello  ', 'trailing spaces should be preserved');
assert.equal(
  csvEscape('  hello, world'),
  '"  hello, world"',
  'leading space with comma should be quoted'
);

// ──────────────────────────────────────────────────────────────
// Special characters that should NOT trigger escaping
// ──────────────────────────────────────────────────────────────

assert.equal(csvEscape('hello@world'), 'hello@world');
assert.equal(csvEscape('hello#world'), 'hello#world');
assert.equal(csvEscape('hello-world'), 'hello-world');
assert.equal(csvEscape('hello_world'), 'hello_world');
assert.equal(csvEscape('hello world'), 'hello world');

console.log('csv-escape.test.ts: all assertions passed');
