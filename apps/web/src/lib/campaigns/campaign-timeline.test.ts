import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIMELINE_BUCKETS,
  MAX_TIMELINE_BUCKETS,
  buildCampaignTimeline,
  clampBucketCount,
  type CampaignTimelineSample,
} from './campaign-timeline';

const START = '2026-10-19T00:00:00.000Z';
const END = '2026-10-19T02:00:00.000Z';

function iso(offsetMs: number): string {
  return new Date(Date.parse(START) + offsetMs).toISOString();
}

function sample(offsetMs: number, overrides: Partial<CampaignTimelineSample> = {}): CampaignTimelineSample {
  return { at: iso(offsetMs), seeds: 0, failures: 0, ...overrides };
}

describe('campaign timeline bucketing', () => {
  it('clamps bucket requests to a bounded, positive range', () => {
    expect(clampBucketCount(undefined)).toBe(DEFAULT_TIMELINE_BUCKETS);
    expect(clampBucketCount(Number.NaN)).toBe(DEFAULT_TIMELINE_BUCKETS);
    expect(clampBucketCount(0)).toBe(1);
    expect(clampBucketCount(-10)).toBe(1);
    expect(clampBucketCount(12.8)).toBe(12);
    expect(clampBucketCount(10_000)).toBe(MAX_TIMELINE_BUCKETS);
  });

  it('folds raw samples into the requested number of buckets', () => {
    const samples = Array.from({ length: 61 }, (_, index) =>
      sample(index * 2 * 60_000, { seeds: 10, failures: index === 0 ? 1 : 0 }),
    );
    const series = buildCampaignTimeline({
      campaignId: 'campaign-1',
      samples,
      buckets: 12,
    });

    expect(series.bucketCount).toBe(12);
    expect(series.bucketWidthMs).toBe(10 * 60_000);
    expect(series.range).toEqual({ start: START, end: END });
    expect(series.buckets[0].seeds).toBe(50); // 00:00, 00:02, 00:04, 00:06, 00:08
    expect(series.buckets[0].failures).toBe(1);
    expect(series.buckets[0].failureRate).toBeCloseTo(1 / 50, 6);
    expect(series.sampledPoints).toBe(61);
    expect(series.downsampled).toBe(true);
    expect(series.summary.seeds).toBe(610);
    expect(series.summary.failures).toBe(1);
    expect(series.summary.failureRate).toBeCloseTo(1 / 610, 6);
  });

  it('keeps the bucket count at or under the cap for very long runs', () => {
    const manySamples = Array.from({ length: 5_000 }, (_, index) =>
      sample(index * 30_000, { seeds: 1 }),
    );
    const series = buildCampaignTimeline({
      campaignId: 'long',
      samples: manySamples,
      buckets: 50_000,
    });

    expect(series.bucketCount).toBeLessThanOrEqual(MAX_TIMELINE_BUCKETS);
    expect(series.requestedBuckets).toBe(MAX_TIMELINE_BUCKETS);
    expect(series.downsampled).toBe(true);
    expect(series.buckets.reduce((sum, bucket) => sum + bucket.seeds, 0)).toBe(5_000);
  });

  it('aggregates distinct signatures per bucket and caps the echoed list', () => {
    const signatures = Array.from({ length: 30 }, (_, index) => `SIG-${index}`);
    const series = buildCampaignTimeline({
      campaignId: 'sigs',
      samples: [sample(0, { seeds: 5, failures: 4, signatures })],
      range: { start: START, end: END },
      buckets: 2,
    });

    expect(series.buckets[0].signatureCount).toBe(30);
    expect(series.buckets[0].signatures).toHaveLength(20);
    expect(series.summary.distinctSignatures).toBe(30);
  });

  it('filters markers and failures to the requested range and sorts them', () => {
    const series = buildCampaignTimeline({
      campaignId: 'markers',
      samples: [sample(0, { seeds: 1 }), sample(60 * 60_000, { seeds: 1 })],
      range: { start: START, end: END },
      buckets: 4,
      markers: [
        { id: 'late', kind: 'checkpoint', at: END, label: 'Checkpoint' },
        { id: 'early', kind: 'campaign_start', at: START, label: 'Start' },
        { id: 'outside', kind: 'campaign_pause', at: '2026-10-20T00:00:00.000Z', label: 'Outside' },
      ],
      failures: [
        { id: 'f2', at: iso(60 * 60_000), signature: 'B' },
        { id: 'f1', at: START, signature: 'A' },
      ],
    });

    expect(series.markers.map((marker) => marker.id)).toEqual(['early', 'late']);
    expect(series.failures.map((failure) => failure.id)).toEqual(['f1', 'f2']);
    expect(series.buckets[0].seeds).toBe(1);
    expect(series.buckets[2].seeds).toBe(1);
  });

  it('handles empty and invalid input without producing an unbounded series', () => {
    const now = new Date('2026-10-19T12:00:00.000Z');
    const series = buildCampaignTimeline({
      campaignId: 'empty',
      samples: [
        { at: 'not-a-date', seeds: 100, failures: 2 },
        { at: START, seeds: -5, failures: -1 },
      ],
      range: { start: START, end: START },
      buckets: 0,
      now,
    });

    expect(series.bucketCount).toBe(1);
    expect(series.buckets[0].seeds).toBe(0);
    expect(series.buckets[0].failures).toBe(0);
    expect(series.buckets[0].failureRate).toBe(0);
    expect(series.sampledPoints).toBe(1);
    expect(series.range.start).toBe(START);
    expect(series.range.end).not.toBe(series.range.start);
  });

  it('falls back to the clock for a completely empty series', () => {
    const now = new Date('2026-10-19T12:00:00.000Z');
    const series = buildCampaignTimeline({ campaignId: 'empty', samples: [], now });

    expect(series.bucketCount).toBe(1);
    expect(series.range.start).toBe(now.toISOString());
    expect(series.sampledPoints).toBe(0);
    expect(series.downsampled).toBe(false);
  });

  it('reports a single sample as a one-bucket series unless a wider range is requested', () => {
    const series = buildCampaignTimeline({
      campaignId: 'single',
      samples: [{ at: START, seeds: 7, failures: 1 }],
    });

    expect(series.bucketCount).toBe(1);
    expect(series.buckets[0].seeds).toBe(7);
    expect(series.downsampled).toBe(false);
  });
});
