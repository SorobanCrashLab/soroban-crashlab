import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

/** The route reads conditional-request headers, so it needs a real request. */
const request = () => new NextRequest('http://localhost/api/sentry/reports');

describe('/api/sentry/reports', () => {
  it('returns 200 with a non-empty reports array', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(Array.isArray(json.data.reports)).toBe(true);
    expect(json.data.reports.length).toBeGreaterThan(0);
  });

  it('each report has the fields the client adapter depends on', async () => {
    const response = await GET(request());
    const json = await response.json();
    for (const report of json.data.reports) {
      expect(typeof report.id).toBe('string');
      expect(typeof report.timestamp).toBe('string');
      expect(typeof report.signature).toBe('string');
      expect(typeof report.sentryEventId).toBe('string');
      expect(['sent', 'pending', 'failed']).toContain(report.status);
    }
  });
});
