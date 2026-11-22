import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import {
  recordCampaignSample,
  registerCampaign,
  resetCampaignRegistry,
} from '@/lib/campaigns/campaign-registry';

const START = '2026-10-19T00:00:00.000Z';
const END = '2026-10-19T02:00:00.000Z';

function timelineRequest(query = ''): NextRequest {
  return new NextRequest(`http://t/api/campaigns/campaign-1/timeline${query}`);
}

function context(id = 'campaign-1'): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function seedCampaign(): void {
  registerCampaign({ id: 'campaign-1', name: 'Nightly', createdAt: START });
  for (let minute = 0; minute <= 120; minute += 2) {
    recordCampaignSample('campaign-1', {
      at: new Date(Date.parse(START) + minute * 60_000).toISOString(),
      seeds: 10,
      failures: minute === 30 ? 1 : 0,
      signatures: minute === 30 ? ['SIG-A'] : [],
    });
  }
}

beforeEach(() => resetCampaignRegistry());

describe('GET /api/campaigns/[id]/timeline', () => {
  it('returns 404 for an unknown campaign', async () => {
    const response = await GET(timelineRequest(), context('missing'));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: 'Campaign not found.' });
  });

  it('returns a bounded, downsampled series with campaign metadata', async () => {
    seedCampaign();
    const response = await GET(timelineRequest('?buckets=8'), context());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Timeline-Buckets')).toBe('8');
    expect(response.headers.get('X-Timeline-Downsampled')).toBe('true');

    const body = (await response.json()) as {
      data: {
        campaign: { id: string; name: string };
        bucketCount: number;
        buckets: Array<{ seeds: number; failures: number }>;
        summary: { seeds: number; failures: number };
      };
    };

    expect(body.data.campaign).toMatchObject({ id: 'campaign-1', name: 'Nightly' });
    expect(body.data.bucketCount).toBe(8);
    expect(body.data.summary.seeds).toBe(610);
    expect(body.data.summary.failures).toBe(1);
    expect(body.data.buckets.reduce((sum, bucket) => sum + bucket.seeds, 0)).toBe(610);
  });

  it('honours from/to and keeps only matching markers and failures', async () => {
    seedCampaign();
    const response = await GET(
      timelineRequest(`?from=${encodeURIComponent(START)}&to=${encodeURIComponent(END)}&buckets=4`),
      context(),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: {
        range: { start: string; end: string };
        failures: Array<{ signature: string }>;
        markers: Array<{ kind: string }>;
      };
    };

    expect(body.data.range).toEqual({ start: START, end: END });
    expect(body.data.failures).toHaveLength(1);
    expect(body.data.markers.map((marker) => marker.kind)).toContain('campaign_start');
  });

  it('clamps over-large bucket requests to the cap', async () => {
    seedCampaign();
    const response = await GET(timelineRequest('?buckets=100000'), context());

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Timeline-Buckets')).toBe('500');
  });

  it('rejects malformed queries instead of guessing', async () => {
    seedCampaign();

    expect((await GET(timelineRequest('?buckets=abc'), context())).status).toBe(400);
    expect((await GET(timelineRequest('?buckets=0'), context())).status).toBe(400);
    expect((await GET(timelineRequest('?from=yesterday'), context())).status).toBe(400);
    expect((await GET(timelineRequest('?to=not-a-date'), context())).status).toBe(400);
    expect(
      (
        await GET(
          timelineRequest(
            `?from=${encodeURIComponent(END)}&to=${encodeURIComponent(START)}`,
          ),
          context(),
        )
      ).status,
    ).toBe(400);
  });

  it('serves markers-only campaigns without samples', async () => {
    registerCampaign({ id: 'campaign-1', createdAt: START });
    const response = await GET(timelineRequest(), context());

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { sampledPoints: number; bucketCount: number; markers: unknown[] };
    };
    expect(body.data.sampledPoints).toBe(0);
    expect(body.data.bucketCount).toBe(1);
    expect(body.data.markers).toHaveLength(1);
  });
});
