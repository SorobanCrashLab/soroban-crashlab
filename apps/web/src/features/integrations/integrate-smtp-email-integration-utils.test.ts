import { describe, it, expect } from 'vitest';
import {
  summariseEmailLog,
  formatEmailTimestamp,
  emailStatusLabel,
  type EmailLogEntry,
} from './integrate-smtp-email-integration-utils';

function makeEntry(overrides: Partial<EmailLogEntry> = {}): EmailLogEntry {
  return {
    id: 'email-1',
    to: 'a@example.com',
    subject: 'Test',
    status: 'sent',
    sentAt: '2026-07-20T14:32:00.000Z',
    ...overrides,
  };
}

describe('summariseEmailLog', () => {
  it('returns all zeros for an empty log', () => {
    expect(summariseEmailLog([])).toEqual({ total: 0, sent: 0, failed: 0 });
  });

  it('counts sent and failed entries', () => {
    const summary = summariseEmailLog([
      makeEntry({ status: 'sent' }),
      makeEntry({ status: 'sent' }),
      makeEntry({ status: 'failed' }),
    ]);
    expect(summary).toEqual({ total: 3, sent: 2, failed: 1 });
  });
});

describe('formatEmailTimestamp', () => {
  it('formats a valid ISO timestamp', () => {
    const formatted = formatEmailTimestamp('2026-07-20T14:32:00.000Z');
    expect(formatted).not.toBe('2026-07-20T14:32:00.000Z');
    expect(typeof formatted).toBe('string');
  });

  it('returns the original string for an invalid timestamp', () => {
    expect(formatEmailTimestamp('not-a-date')).toBe('not-a-date');
  });
});

describe('emailStatusLabel', () => {
  it('labels sent and failed statuses', () => {
    expect(emailStatusLabel('sent')).toBe('Sent');
    expect(emailStatusLabel('failed')).toBe('Failed');
  });
});
