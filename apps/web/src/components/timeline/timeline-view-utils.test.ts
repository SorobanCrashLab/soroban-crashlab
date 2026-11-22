import { describe, expect, it } from 'vitest';
import { buildCampaignTimeline } from '@/lib/campaigns/campaign-timeline';
import {
  MIN_TIMELINE_WINDOW_MS,
  bucketAtTime,
  bucketIndexAt,
  clampWindowToRange,
  clampZoomLevel,
  failuresInWindow,
  formatFailureRate,
  formatSeedRate,
  formatTimelineClock,
  formatTimelineClockForSeries,
  formatWindowSpan,
  fullTimelineWindow,
  nextZoomLevel,
  offsetPercent,
  readoutAt,
  sliceBuckets,
  stepPlayheadMs,
  timeAtPercent,
  timelineWindowSpan,
  windowForBucket,
  windowForZoom,
  zoomSpanForLevel,
} from './timeline-view-utils';

const START = '2026-10-19T00:00:00.000Z';
const END = '2026-10-19T02:00:00.000Z';
const HOUR_MS = 60 * 60 * 1000;

const series = buildCampaignTimeline({
  campaignId: 'campaign-1',
  range: { start: START, end: END },
  buckets: 4,
  samples: [
    { at: START, seeds: 10, failures: 1, signatures: ['SIG-A'] },
    { at: new Date(Date.parse(START) + 31 * 60_000).toISOString(), seeds: 20, failures: 0 },
    { at: new Date(Date.parse(START) + HOUR_MS).toISOString(), seeds: 30, failures: 2, signatures: ['SIG-B'] },
  ],
  failures: [
    { id: 'f1', at: new Date(Date.parse(START) + 31 * 60_000).toISOString(), signature: 'SIG-A' },
  ],
});

const full = fullTimelineWindow(series);

describe('timeline view window', () => {
  it('zooms by halving the span and floors at five minutes', () => {
    const day = 24 * HOUR_MS;
    expect(zoomSpanForLevel(day, 0)).toBe(day);
    expect(zoomSpanForLevel(day, 1)).toBe(12 * HOUR_MS);
    expect(zoomSpanForLevel(day, 12)).toBe(MIN_TIMELINE_WINDOW_MS);
    expect(zoomSpanForLevel(day, -5)).toBe(day);
  });

  it('centres the zoomed window on the playhead and clamps at the edges', () => {
    const centered = windowForZoom(full, 1, Date.parse(START) + HOUR_MS);
    expect(timelineWindowSpan(centered)).toBe(HOUR_MS);
    expect(centered.startMs).toBe(Date.parse(START) + 30 * 60_000);

    const atEnd = windowForZoom(full, 1, Date.parse(END));
    expect(atEnd.endMs).toBe(Date.parse(END));
    expect(atEnd.startMs).toBe(Date.parse(END) - HOUR_MS);

    expect(windowForZoom(full, 0, Date.parse(START))).toEqual(full);
  });

  it('clamps arbitrary windows to the full range', () => {
    const clamped = clampWindowToRange(
      { startMs: Date.parse(START) - HOUR_MS, endMs: Date.parse(START) + HOUR_MS },
      full,
    );
    expect(clamped.startMs).toBe(full.startMs);
    expect(clamped.endMs).toBe(full.startMs + 2 * HOUR_MS);

    const tooWide = clampWindowToRange(
      { startMs: full.startMs - 5 * HOUR_MS, endMs: full.endMs + 5 * HOUR_MS },
      full,
    );
    expect(tooWide).toEqual(full);
  });

  it('converts between percentages and timestamps', () => {
    expect(offsetPercent(full, full.startMs)).toBe(0);
    expect(offsetPercent(full, full.endMs)).toBe(100);
    expect(offsetPercent(full, full.startMs + HOUR_MS)).toBe(50);
    expect(timeAtPercent(full, 25)).toBe(full.startMs + HOUR_MS / 2);
    expect(timeAtPercent(full, 250)).toBe(full.endMs);
  });

  it('steps the playhead by buckets and clamps to the window', () => {
    const startMs = Date.parse(START);
    // Bucket width is 30 minutes in this series.
    expect(stepPlayheadMs(series, startMs, 2)).toBe(startMs + HOUR_MS);
    expect(stepPlayheadMs(series, startMs, 100)).toBe(Date.parse(END));
    expect(stepPlayheadMs(series, startMs, -10)).toBe(startMs);

    const window = { startMs: startMs + 15 * 60_000, endMs: startMs + 45 * 60_000 };
    expect(stepPlayheadMs(series, startMs, -1, window)).toBe(window.startMs);
  });
});

describe('timeline readout', () => {
  it('maps timestamps to buckets, clamping at the edges', () => {
    expect(bucketIndexAt(series, Date.parse(START))).toBe(0);
    expect(bucketIndexAt(series, Date.parse(START) + 31 * 60_000)).toBe(1);
    expect(bucketIndexAt(series, Date.parse(END))).toBe(3);
    expect(bucketIndexAt(series, Date.parse(START) - HOUR_MS)).toBe(0);
    expect(bucketAtTime(series, Date.parse(START) + 31 * 60_000)?.seeds).toBe(20);
  });

  it('reports seeds, failures and throughput at the playhead', () => {
    const readout = readoutAt(series, Date.parse(START) + 31 * 60_000);
    expect(readout.seeds).toBe(20);
    expect(readout.failures).toBe(0);
    expect(readout.failureRate).toBe(0);
    expect(readout.seedsPerSecond).toBeCloseTo(20 / 1800, 6);
    expect(readout.clock).toBe('00:31:00');

    const first = readoutAt(series, Date.parse(START));
    expect(first.failures).toBe(1);
    expect(first.signatureCount).toBe(1);
    expect(first.signatures).toEqual(['SIG-A']);
  });

  it('lists buckets and failures overlapping a window', () => {
    const window = { startMs: Date.parse(START) + 30 * 60_000, endMs: Date.parse(START) + 90 * 60_000 };
    expect(sliceBuckets(series, window).map((bucket) => bucket.start)).toEqual([
      series.buckets[1].start,
      series.buckets[2].start,
    ]);
    expect(failuresInWindow(series, window).map((failure) => failure.id)).toEqual(['f1']);
    expect(
      failuresInWindow(series, { startMs: Date.parse(START), endMs: Date.parse(START) + 60_000 }),
    ).toHaveLength(0);
  });

  it('expands a failed bucket to the five-minute floor for the failure list', () => {
    const narrow = windowForBucket(series, series.buckets[1]);
    expect(timelineWindowSpan(narrow)).toBe(30 * 60_000);
    expect(narrow.startMs).toBe(Date.parse(series.buckets[1].start));
    expect(narrow.endMs).toBe(Date.parse(series.buckets[1].end));
  });
});

describe('timeline formatting', () => {
  it('formats clocks in UTC with an optional date', () => {
    expect(formatTimelineClock(0)).toBe('00:00:00');
    expect(formatTimelineClock(Date.parse(START))).toBe('00:00:00');
    expect(formatTimelineClock(Date.parse(START), true)).toBe('10-19 00:00:00');
    expect(formatTimelineClock(Number.NaN)).toBe('--:--:--');
  });

  it('adds the date when the range spans more than two days', () => {
    expect(formatTimelineClockForSeries(series, Date.parse(START))).toBe('00:00:00');
    const longSeries = { ...series, range: { start: START, end: '2026-10-25T00:00:00.000Z' } };
    expect(formatTimelineClockForSeries(longSeries, Date.parse(START))).toBe('10-19 00:00:00');
  });

  it('formats rates and spans', () => {
    expect(formatFailureRate(0)).toBe('0.0%');
    expect(formatFailureRate(-1)).toBe('0.0%');
    expect(formatFailureRate(1 / 12)).toBe('8.3%');
    expect(formatSeedRate(0)).toBe('0/s');
    expect(formatSeedRate(1.5)).toBe('1.5/s');
    expect(formatSeedRate(12.4)).toBe('12/s');
    expect(formatSeedRate(1_250)).toBe('1.3k/s');
    expect(formatWindowSpan(24 * HOUR_MS, 24 * HOUR_MS)).toBe('Full run');
    expect(formatWindowSpan(5 * 60_000, 24 * HOUR_MS)).toBe('5m');
    expect(formatWindowSpan(90_000, 24 * HOUR_MS)).toBe('1m 30s');
    expect(formatWindowSpan(45_000, 24 * HOUR_MS)).toBe('45s');
    expect(formatWindowSpan(2 * HOUR_MS + 5 * 60_000, 24 * HOUR_MS)).toBe('2h 05m');
  });

  it('clamps zoom levels', () => {
    expect(clampZoomLevel(-3)).toBe(0);
    expect(clampZoomLevel(4.9)).toBe(4);
    expect(clampZoomLevel(Number.NaN)).toBe(0);
    expect(nextZoomLevel(0, -1)).toBe(0);
    expect(nextZoomLevel(0, 1)).toBe(1);
  });
});
