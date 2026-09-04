import { describe, expect, it } from 'vitest';
import { CronParseError, cronErrorMessage, parseCron } from './parser';

describe('parseCron — valid expressions', () => {
  it('parses all-wildcards', () => {
    const expr = parseCron('* * * * *');
    expect(expr.minute).toHaveLength(60);
    expect(expr.hour).toHaveLength(24);
    expect(expr.dayOfMonth).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
    expect(expr.month).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(expr.dayOfWeek).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(expr.dayOfMonthRestricted).toBe(false);
    expect(expr.dayOfWeekRestricted).toBe(false);
  });

  it('parses a single value per field', () => {
    const expr = parseCron('30 9 15 6 3');
    expect(expr.minute).toEqual([30]);
    expect(expr.hour).toEqual([9]);
    expect(expr.dayOfMonth).toEqual([15]);
    expect(expr.month).toEqual([6]);
    expect(expr.dayOfWeek).toEqual([3]);
    expect(expr.dayOfMonthRestricted).toBe(true);
    expect(expr.dayOfWeekRestricted).toBe(true);
  });

  it('parses ranges', () => {
    expect(parseCron('0 9-17 * * *').hour).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
  });

  it('parses step over wildcard', () => {
    expect(parseCron('*/15 * * * *').minute).toEqual([0, 15, 30, 45]);
    expect(parseCron('*/30 * * * *').minute).toEqual([0, 30]);
  });

  it('parses step over a range', () => {
    expect(parseCron('0 0-12/3 * * *').hour).toEqual([0, 3, 6, 9, 12]);
  });

  it('parses "start/step" as start-to-max', () => {
    expect(parseCron('0 20/1 * * *').hour).toEqual([20, 21, 22, 23]);
    expect(parseCron('50/5 * * * *').minute).toEqual([50, 55]);
  });

  it('parses comma lists and de-duplicates + sorts', () => {
    expect(parseCron('5,1,5,3 * * * *').minute).toEqual([1, 3, 5]);
  });

  it('parses a mix of lists, ranges and steps in one field', () => {
    expect(parseCron('0 1,4-6,*/12 * * *').hour).toEqual([0, 1, 4, 5, 6, 12]);
  });

  it('accepts 7 as Sunday and folds it to 0', () => {
    expect(parseCron('0 0 * * 7').dayOfWeek).toEqual([0]);
    expect(parseCron('0 0 * * 0,7').dayOfWeek).toEqual([0]);
    expect(parseCron('0 0 * * 5-7').dayOfWeek).toEqual([0, 5, 6]);
  });

  it('tolerates surrounding and internal whitespace', () => {
    expect(parseCron('  0   9  *  *  * ').hour).toEqual([9]);
  });

  it('keeps the trimmed source', () => {
    expect(parseCron('  0 9 * * *  ').source).toBe('0 9 * * *');
  });
});

describe('parseCron — invalid expressions produce precise messages', () => {
  const cases: Array<[string, RegExp]> = [
    ['', /must not be empty/],
    ['* * * *', /exactly 5 fields.*got 4/],
    ['* * * * * *', /exactly 5 fields.*got 6/],
    ['60 * * * *', /minute value 60 .* out of range \(0-59\)/],
    ['* 24 * * *', /hour value 24 .* out of range \(0-23\)/],
    ['* * 0 * *', /day-of-month value 0 .* out of range \(1-31\)/],
    ['* * 32 * *', /day-of-month value 32 .* out of range/],
    ['* * * 13 *', /month value 13 .* out of range \(1-12\)/],
    ['* * * * 8', /day-of-week value 8 .* out of range \(0-7\)/],
    ['5-1 * * * *', /minute range "5-1" is inverted \(5 > 1\)/],
    ['abc * * * *', /minute value "abc" .* is not a non-negative integer/],
    ['*/0 * * * *', /minute step in ".*" must be 1 or greater/],
    ['1-10/0 * * * *', /minute step in ".*" must be 1 or greater/],
    ['1//2 * * * *', /more than one step/],
    ['1,,2 * * * *', /empty list item/],
    ['1-2-3 * * * *', /minute range "1-2-3" is malformed/],
    ['1- * * * *', /minute range "1-" is malformed/],
    ['-5 * * * *', /minute range "-5" is malformed/],
    ['*/-1 * * * *', /minute step "-1" .* is not a positive integer/],
    ['1.5 * * * *', /minute value "1.5" .* is not a non-negative integer/],
    ['/5 * * * *', /missing a value before/],
  ];

  it.each(cases)('rejects %j', (expression, pattern) => {
    expect(() => parseCron(expression)).toThrow(CronParseError);
    expect(() => parseCron(expression)).toThrow(pattern);
  });
});

describe('parseCron — hostile input', () => {
  it('rejects an absurdly long field without hanging', () => {
    const huge = Array.from({ length: 5000 }, (_, i) => i % 60).join(',');
    expect(parseCron(`${huge} * * * *`).minute).toEqual(
      Array.from({ length: 60 }, (_, i) => i),
    );
  });

  it('does not expand a giant step range beyond its field', () => {
    expect(parseCron('0/999 * * * *').minute).toEqual([0]);
  });

  it('rejects non-string input', () => {
    // @ts-expect-error deliberate misuse
    expect(() => parseCron(null)).toThrow(/must be a string/);
  });

  it('rejects tabs-only / whitespace-only input', () => {
    expect(() => parseCron('\t\t')).toThrow(/must not be empty/);
  });
});

describe('cronErrorMessage', () => {
  it('returns null for a valid expression', () => {
    expect(cronErrorMessage('*/5 * * * *')).toBeNull();
  });

  it('returns the message for an invalid expression', () => {
    expect(cronErrorMessage('99 * * * *')).toMatch(/out of range/);
  });
});
