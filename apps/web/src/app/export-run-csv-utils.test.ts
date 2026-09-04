import * as assert from 'node:assert/strict';
import { buildRunsCsv, resolveCsvColumns, ALL_CSV_COLUMNS } from './export-run-csv-utils';
import type { FuzzingRun } from './types';

function makeRun(overrides: Partial<FuzzingRun> = {}): FuzzingRun {
  return {
    id: 'run-1',
    status: 'completed',
    area: 'auth',
    severity: 'low',
    duration: 1234,
    seedCount: 10,
    cpuInstructions: 500,
    memoryBytes: 2048,
    minResourceFee: 100,
    crashDetail: null,
    ...overrides,
  };
}

/**
 * Simple CSV parser for round-trip verification.
 * Parses a CSV line respecting RFC-4180 quoting rules.
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
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

const runAssertions = () => {
  // No visibleColumns supplied -> every known column is exported.
  assert.deepEqual(resolveCsvColumns(undefined), ALL_CSV_COLUMNS);

  // Hidden fields (absent from visibleColumns) must not appear as columns at all,
  // empty or otherwise.
  const visible = ['id', 'status', 'duration'];
  const cols = resolveCsvColumns(visible);
  assert.deepEqual(cols, visible);
  assert.ok(!cols.includes('cpuInstructions'), 'hidden column cpuInstructions should be dropped');
  assert.ok(!cols.includes('memoryBytes'), 'hidden column memoryBytes should be dropped');

  // Unknown / UI-only ids (e.g. from a table's pseudo-columns) are ignored rather
  // than producing a blank column.
  assert.deepEqual(resolveCsvColumns(['id', 'actions', 'report']), ['id']);

  const run = makeRun();
  const csv = buildRunsCsv([run], visible);
  const [headerLine, dataLine] = csv.split('\n');

  assert.equal(headerLine, 'ID,Status,Duration (ms)');
  assert.equal(headerLine.split(',').length, dataLine.split(',').length);
  assert.equal(dataLine, 'run-1,completed,1234');
  assert.ok(!csv.includes(',,'), 'no empty column should be present between values');

  // Full export when no visibility filter is applied.
  const fullCsv = buildRunsCsv([run]);
  const [fullHeaderLine] = fullCsv.split('\n');
  assert.equal(fullHeaderLine.split(',').length, ALL_CSV_COLUMNS.length);
};

/**
 * Hostile CSV data test: verify round-trip parsing for adversarial inputs.
 * Tests that fields containing commas, quotes, and newlines are escaped
 * correctly and can be parsed back to their original values.
 */
const hostileDataAssertions = () => {
  // Test case 1: Field with comma
  const runWithComma = makeRun({ id: 'run, with, commas' });
  const csvWithComma = buildRunsCsv([runWithComma], ['id', 'status']);
  const [, dataComma] = csvWithComma.split('\n');
  const fieldsComma = parseCSVLine(dataComma);
  assert.equal(fieldsComma[0], 'run, with, commas', 'comma in field should round-trip');
  assert.equal(fieldsComma[1], 'completed', 'status field should remain intact');

  // Test case 2: Field with double quotes
  const runWithQuotes = makeRun({ area: 'error: "auth failure"' as any });
  const csvWithQuotes = buildRunsCsv([runWithQuotes], ['area', 'status']);
  const [, dataQuotes] = csvWithQuotes.split('\n');
  const fieldsQuotes = parseCSVLine(dataQuotes);
  assert.equal(fieldsQuotes[0], 'error: "auth failure"', 'quotes in field should round-trip');

  // Test case 3: Field with newline
  const runWithNewline = makeRun({ status: 'failed\nwith details' as any });
  const csvWithNewline = buildRunsCsv([runWithNewline], ['id', 'status']);
  // With newline in data, we need to parse the entire CSV (not just split by \n)
  // For this simple test, we verify the CSV is well-formed by checking quote escaping
  assert.ok(csvWithNewline.includes('"failed\nwith details"'), 'newline should be quoted');

  // Test case 4: Complex hostile case - all three together
  const complexPayload = 'Error: "invalid", context\nline 2\nline 3';
  const runComplex = makeRun({ area: complexPayload as any });
  const csvComplex = buildRunsCsv([runComplex], ['area']);
  // Don't split on \n since the data itself contains newlines
  // Just parse the CSV directly
  // The first line is the header, the second should have the complex payload (now quoted)
  assert.ok(
    csvComplex.includes('"Error: ""invalid"", context\nline 2\nline 3"'),
    'complex payload should be properly escaped and quoted'
  );

  // Test case 5: Multiple runs with hostile data
  const runs = [
    makeRun({ id: 'run-1' }),
    makeRun({ id: 'run-2, dangerous', status: 'failed\nwith reason' as any }),
    makeRun({ id: 'quote"test', severity: 'critical' }),
  ];
  const csvMultiple = buildRunsCsv(runs, ['id', 'status', 'severity']);
  // Verify the CSV contains properly escaped values
  assert.ok(csvMultiple.includes('"run-2, dangerous"'), 'comma in id should be quoted');
  assert.ok(
    csvMultiple.includes('"failed\nwith reason"'),
    'newline in status should be quoted'
  );
  assert.ok(csvMultiple.includes('"quote""test"'), 'quote in id should be doubled and quoted');
};

runAssertions();
hostileDataAssertions();
console.log('export-run-csv-utils.test.ts: all assertions passed');
