import { describe, expect, it } from 'vitest';
import { humanizeCron } from './humanize';

describe('humanizeCron', () => {
  const cases: Array<[string, string]> = [
    ['* * * * *', 'every minute'],
    ['*/30 * * * *', 'every 30 minutes'],
    ['*/5 * * * *', 'every 5 minutes'],
    ['0 * * * *', 'every hour'],
    ['15 * * * *', 'every hour at minute 15'],
    ['0 */2 * * *', 'every 2 hours'],
    ['30 */6 * * *', 'every 6 hours at minute 30'],
    ['0 9 * * *', 'every day at 09:00 UTC'],
    ['30 17 * * *', 'every day at 17:30 UTC'],
    ['0 9 * * 1', 'at 09:00 UTC on Monday'],
    ['0 9 * * 1,4', 'at 09:00 UTC on Monday and Thursday'],
    ['0 0 1 * *', 'at 00:00 UTC on day 1 of the month'],
    ['0 0 1,15 * *', 'at 00:00 UTC on day 1 and 15 of the month'],
    ['0 0 1 1 *', 'at 00:00 UTC on day 1 of the month in January'],
    ['0 12 * * 1-5', 'at 12:00 UTC on Monday, Tuesday, Wednesday, Thursday and Friday'],
  ];

  it.each(cases)('humanizes %j as %j', (cron, expected) => {
    expect(humanizeCron(cron)).toBe(expected);
  });

  it('reports invalid expressions instead of throwing', () => {
    expect(humanizeCron('99 * * * *')).toMatch(/^Invalid: /);
    expect(humanizeCron('nope')).toMatch(/^Invalid: /);
  });

  it('falls back to a structured phrase for irregular fields', () => {
    expect(humanizeCron('0,20,40 9 * * *')).toBe('at minute 0, 20 and 40 past hour 9');
  });
});
