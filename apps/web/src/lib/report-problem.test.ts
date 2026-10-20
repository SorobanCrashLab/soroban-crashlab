import { describe, expect, it } from 'vitest';
import {
  MAX_EVENT_LENGTH,
  MAX_REPORT_EVENTS,
  buildReportIssueTitle,
  buildReportIssueUrl,
  buildReportProblemPayload,
  classifyViewport,
  normaliseRoute,
  redactReportText,
  redactReportValue,
} from './report-problem';

describe('report-a-problem payload', () => {
  describe('redaction (W5-C10)', () => {
    it('redacts authorization headers whatever the scheme', () => {
      expect(redactReportText('failed with Authorization: Bearer abc123def456ghi789')).toContain(
        'Bearer [redacted]',
      );
      expect(redactReportText('Authorization: Bearer abc123def456ghi789')).not.toContain(
        'abc123def456ghi789',
      );
    });

    it('redacts GitHub and other well-known token shapes', () => {
      const secrets = [
        'ghp_abcdefghijklmnopqrstuvwxyz012345',
        'github_pat_11ABCDEFG00abcdef_secretvalue',
        'sk-live_000000000000000000',
        ['xoxb', '0000000000', '0000000000', 'abcdefghijklmnopqrst'].join('-'),
        'AKIAIOSFODNN7EXAMPLE',
      ];
      for (const secret of secrets) {
        expect(redactReportText(`token=${secret}`)).not.toContain(secret);
      }
    });

    it('redacts credentials embedded in URLs', () => {
      const redacted = redactReportText('GET https://user:sup3rs3cret@internal.example/api');
      expect(redacted).not.toContain('sup3rs3cret');
      expect(redacted).toContain('[redacted]');
    });

    it('redacts key=value secrets and email addresses', () => {
      expect(redactReportText('password=hunter2')).not.toContain('hunter2');
      expect(redactReportText('api_key = "abc123xyz456"')).not.toContain('abc123xyz456');
      expect(redactReportText('notify dana@example.com')).toContain('[redacted-email]');
    });

    it('redacts sensitive keys even when the value has an unexpected shape', () => {
      const redacted = redactReportValue({
        note: 'ok',
        authorization: { header: 'Bearer abc' },
        nested: { apiKey: 'shh', list: ['password=pw1'] },
      }) as Record<string, unknown>;

      expect(redacted.authorization).toBe('[redacted]');
      expect(JSON.stringify(redacted)).not.toContain('shh');
      expect(JSON.stringify(redacted)).not.toContain('pw1');
      expect(redacted.note).toBe('ok');
    });

    it('is idempotent', () => {
      const once = redactReportText('password=abc and dana@example.com');
      expect(redactReportText(once)).toBe(once);
    });
  });

  describe('route normalisation', () => {
    it('drops query strings, which carry tokens', () => {
      expect(normaliseRoute('/runs/run-42?token=ghp_secret')).toBe('/runs/run-42');
      expect(normaliseRoute('/runs/run-42#frag')).toBe('/runs/run-42');
    });

    it('falls back to root for an empty route', () => {
      expect(normaliseRoute('')).toBe('/');
      expect(normaliseRoute('   ')).toBe('/');
    });

    it('caps absurdly long routes', () => {
      expect(normaliseRoute(`/${'a'.repeat(1000)}`).length).toBeLessThanOrEqual(200);
    });
  });

  describe('buildReportProblemPayload', () => {
    const now = new Date('2026-10-19T10:00:00.000Z');

    it('captures route, request id, class and timestamp', () => {
      const payload = buildReportProblemPayload({
        route: '/triage/queue',
        requestId: 'req-77',
        errorClass: 'internal',
        summary: 'The queue never finished loading',
        now,
      });

      expect(payload).toMatchObject({
        schema: 1,
        route: '/triage/queue',
        requestId: 'req-77',
        errorClass: 'internal',
        summary: 'The queue never finished loading',
        timestamp: '2026-10-19T10:00:00.000Z',
      });
      expect(payload.events).toEqual([]);
    });

    it('caps the event trail and truncates long messages', () => {
      const events = Array.from({ length: 60 }, (_, index) => ({
        level: 'info' as const,
        message: `event ${index} ${'x'.repeat(1000)}`,
      }));
      const payload = buildReportProblemPayload({ route: '/runs', events, now });

      expect(payload.events).toHaveLength(MAX_REPORT_EVENTS);
      // The retained tail is the most recent window, oldest dropped first.
      expect(payload.events[0]?.message).toContain('event 40');
      expect(payload.events.at(-1)?.message).toContain('event 59');
      for (const event of payload.events) {
        expect(event.message.length).toBeLessThanOrEqual(MAX_EVENT_LENGTH);
      }
    });

    it('redacts secrets in the summary and in event messages', () => {
      const payload = buildReportProblemPayload({
        route: '/settings/api',
        summary: 'token=ghp_abcdefghijklmnopqrstuvwxyz012345 failed',
        events: [{ level: 'error', message: 'retry with password=hunter2' }],
        now,
      });

      const serialised = JSON.stringify(payload);
      expect(serialised).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz012345');
      expect(serialised).not.toContain('hunter2');
      expect(payload.requestId).toBeUndefined();
    });

    it('drops events without a message', () => {
      const payload = buildReportProblemPayload({
        route: '/runs',
        events: [{ message: '' }, { message: 'kept' }],
        now,
      });
      expect(payload.events).toHaveLength(1);
      expect(payload.events[0]?.message).toBe('kept');
    });

    it('does not throw on an invalid clock', () => {
      const payload = buildReportProblemPayload({
        route: '/runs',
        now: new Date('not-a-date'),
      });
      expect(Number.isNaN(Date.parse(payload.timestamp))).toBe(false);
    });
  });

  describe('classifyViewport', () => {
    it('buckets widths for layout-relevant repro', () => {
      expect(classifyViewport(375)).toBe('mobile');
      expect(classifyViewport(800)).toBe('tablet');
      expect(classifyViewport(1440)).toBe('desktop');
      expect(classifyViewport(0)).toBe('unknown');
      expect(classifyViewport(Number.NaN)).toBe('unknown');
    });
  });

  describe('issue url', () => {
    it('encodes a lowercase, punctuation-free title', () => {
      const payload = buildReportProblemPayload({
        route: '/runs',
        errorClass: 'internal',
        summary: 'The runs table never rendered',
        requestId: 'req-1',
        now: new Date('2026-10-19T10:00:00.000Z'),
      });
      const title = buildReportIssueTitle(payload);

      expect(title.startsWith('report a problem')).toBe(true);
      expect(title).not.toMatch(/[.]$/);
      expect(title).toBe(title.toLowerCase());
    });

    it('round-trips the payload through the query string', () => {
      const payload = buildReportProblemPayload({
        route: '/runs/run-42',
        requestId: 'req-42',
        summary: 'boom',
        now: new Date('2026-10-19T10:00:00.000Z'),
      });
      const url = new URL(buildReportIssueUrl(payload));

      expect(url.pathname).toBe('/SorobanCrashLab/soroban-crashlab/issues/new');
      const body = url.searchParams.get('body') ?? '';
      expect(body).toContain('Route: /runs/run-42');
      expect(body).toContain('Request id: req-42');
      expect(url.searchParams.get('title')).toContain('report a problem');
    });
  });
});
