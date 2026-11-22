/**
 * Pure view-state helpers for the campaign timeline scrubber (#1874).
 *
 * Keeping zoom, playhead and window math out of the component makes the
 * interesting behaviour (5-minute floor, window clamping, readout values)
 * unit-testable without a DOM.
 */

import type {
  CampaignTimelineBucket,
  CampaignTimelineFailure,
  CampaignTimelineSeries,
} from '@/lib/campaigns/campaign-timeline';

export interface TimelineWindow {
  startMs: number;
  endMs: number;
}

/** Zoom stops at a five-minute window; that is the tightest useful view. */
export const MIN_TIMELINE_WINDOW_MS = 5 * 60 * 1000;
export const MAX_TIMELINE_ZOOM_LEVEL = 12;

export function parseTimelineTime(value: string | undefined): number {
  if (typeof value !== 'string' || value.length === 0) return Number.NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function fullTimelineWindow(series: CampaignTimelineSeries): TimelineWindow {
  const startMs = parseTimelineTime(series.range.start);
  const endMs = parseTimelineTime(series.range.end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { startMs: 0, endMs: 1 };
  }
  return { startMs, endMs: Math.max(endMs, startMs + 1) };
}

/**
 * Halves the visible span per zoom level and never goes below five minutes.
 * Level 0 is always the full run.
 */
export function zoomSpanForLevel(fullSpanMs: number, level: number): number {
  if (!Number.isFinite(fullSpanMs) || fullSpanMs <= 0) return MIN_TIMELINE_WINDOW_MS;
  const clampedLevel = Math.min(MAX_TIMELINE_ZOOM_LEVEL, Math.max(0, Math.floor(level)));
  if (clampedLevel === 0) return fullSpanMs;
  return Math.max(Math.min(fullSpanMs, MIN_TIMELINE_WINDOW_MS), fullSpanMs / 2 ** clampedLevel);
}

export function clampZoomLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.min(MAX_TIMELINE_ZOOM_LEVEL, Math.max(0, Math.floor(level)));
}

export function nextZoomLevel(level: number, direction: 1 | -1): number {
  return clampZoomLevel(clampZoomLevel(level) + direction);
}

/** Centres the playhead in the zoomed window, clamped to the full range. */
export function windowForZoom(
  full: TimelineWindow,
  level: number,
  focusMs: number,
): TimelineWindow {
  const fullSpan = full.endMs - full.startMs;
  const span = Math.min(fullSpan, zoomSpanForLevel(fullSpan, level));
  if (span >= fullSpan) return { ...full };
  const focus = Number.isFinite(focusMs) ? focusMs : full.endMs;
  const start = Math.min(
    Math.max(full.startMs, focus - span / 2),
    Math.max(full.startMs, full.endMs - span),
  );
  return { startMs: start, endMs: start + span };
}

export function clampWindowToRange(window: TimelineWindow, full: TimelineWindow): TimelineWindow {
  const fullSpan = full.endMs - full.startMs;
  const span = Math.min(fullSpan, Math.max(1, window.endMs - window.startMs));
  const start = Math.min(Math.max(full.startMs, window.startMs), full.endMs - span);
  return { startMs: start, endMs: start + span };
}

export function timelineWindowSpan(window: TimelineWindow): number {
  return Math.max(0, window.endMs - window.startMs);
}

export function offsetPercent(window: TimelineWindow, atMs: number): number {
  const span = timelineWindowSpan(window);
  if (span <= 0) return 0;
  return Math.min(100, Math.max(0, ((atMs - window.startMs) / span) * 100));
}

export function timeAtPercent(window: TimelineWindow, percent: number): number {
  const clamped = Math.min(100, Math.max(0, percent));
  return window.startMs + (timelineWindowSpan(window) * clamped) / 100;
}

export function bucketIndexAt(series: CampaignTimelineSeries, atMs: number): number {
  if (series.buckets.length === 0) return -1;
  const rangeStart = parseTimelineTime(series.range.start);
  if (!Number.isFinite(rangeStart)) return 0;
  const width = series.bucketWidthMs > 0 ? series.bucketWidthMs : 1;
  const raw = Math.floor((atMs - rangeStart) / width);
  return Math.min(series.buckets.length - 1, Math.max(0, raw));
}

export function bucketAtTime(
  series: CampaignTimelineSeries,
  atMs: number,
): CampaignTimelineBucket | null {
  const index = bucketIndexAt(series, atMs);
  return index < 0 ? null : series.buckets[index];
}

/** Buckets overlapping the window, in series order. */
export function sliceBuckets(
  series: CampaignTimelineSeries,
  window: TimelineWindow,
): CampaignTimelineBucket[] {
  return series.buckets.filter((bucket) => {
    const bucketStart = parseTimelineTime(bucket.start);
    const bucketEnd = parseTimelineTime(bucket.end);
    if (!Number.isFinite(bucketStart) || !Number.isFinite(bucketEnd)) return false;
    return bucketEnd > window.startMs && bucketStart < window.endMs;
  });
}

export function failuresInWindow(
  series: CampaignTimelineSeries,
  window: TimelineWindow,
): CampaignTimelineFailure[] {
  return series.failures.filter((failure) => {
    const at = parseTimelineTime(failure.at);
    return Number.isFinite(at) && at >= window.startMs && at <= window.endMs;
  });
}

export interface PlayheadReadout {
  atMs: number;
  clock: string;
  bucketStart: string;
  bucketEnd: string;
  seeds: number;
  failures: number;
  failureRate: number;
  seedsPerSecond: number;
  signatureCount: number;
  signatures: string[];
}

export function readoutAt(series: CampaignTimelineSeries, atMs: number): PlayheadReadout {
  const bucket = bucketAtTime(series, atMs);
  const widthMs = series.bucketWidthMs > 0 ? series.bucketWidthMs : 1;
  const seeds = bucket?.seeds ?? 0;
  const failures = bucket?.failures ?? 0;
  return {
    atMs,
    clock: formatTimelineClock(atMs),
    bucketStart: bucket?.start ?? series.range.start,
    bucketEnd: bucket?.end ?? series.range.end,
    seeds,
    failures,
    failureRate: bucket?.failureRate ?? 0,
    seedsPerSecond: seeds / (widthMs / 1000),
    signatureCount: bucket?.signatureCount ?? 0,
    signatures: bucket?.signatures ?? [],
  };
}

/** Moves the playhead by whole buckets, clamped to `window` (or the range). */
export function stepPlayheadMs(
  series: CampaignTimelineSeries,
  atMs: number,
  steps: number,
  window?: TimelineWindow,
): number {
  const full = fullTimelineWindow(series);
  const bounds = window ?? full;
  const step = Math.max(1, series.bucketWidthMs);
  const moved = atMs + steps * step;
  return Math.min(bounds.endMs, Math.max(bounds.startMs, moved));
}

/**
 * Window used when a failed bucket is clicked: the bucket itself, expanded to
 * the five-minute floor so the failure lane stays readable.
 */
export function windowForBucket(
  series: CampaignTimelineSeries,
  bucket: CampaignTimelineBucket,
): TimelineWindow {
  const full = fullTimelineWindow(series);
  const bucketStart = parseTimelineTime(bucket.start);
  const bucketEnd = parseTimelineTime(bucket.end);
  if (!Number.isFinite(bucketStart) || !Number.isFinite(bucketEnd)) return full;
  const mid = (bucketStart + bucketEnd) / 2;
  const span = Math.max(MIN_TIMELINE_WINDOW_MS, bucketEnd - bucketStart);
  return clampWindowToRange({ startMs: mid - span / 2, endMs: mid + span / 2 }, full);
}

/** `HH:MM:SS` in UTC; a date prefix is added once the range spans days. */
export function formatTimelineClock(atMs: number, includeDate = false): string {
  if (!Number.isFinite(atMs)) return '--:--:--';
  const iso = new Date(atMs).toISOString();
  return includeDate ? `${iso.slice(5, 10)} ${iso.slice(11, 19)}` : iso.slice(11, 19);
}

export function formatTimelineClockForSeries(
  series: CampaignTimelineSeries,
  atMs: number,
): string {
  const full = fullTimelineWindow(series);
  return formatTimelineClock(atMs, full.endMs - full.startMs > 48 * 60 * 60 * 1000);
}

export function formatFailureRate(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return '0.0%';
  return `${(rate * 100).toFixed(1)}%`;
}

export function formatFailureRateWithCap(rate: number): string {
  return formatFailureRate(Math.min(1, rate));
}

export function formatSeedRate(seedsPerSecond: number): string {
  if (!Number.isFinite(seedsPerSecond) || seedsPerSecond <= 0) return '0/s';
  if (seedsPerSecond >= 1_000) return `${(seedsPerSecond / 1_000).toFixed(1)}k/s`;
  return `${seedsPerSecond.toFixed(seedsPerSecond >= 10 ? 0 : 1)}/s`;
}

/** Human label for the current zoom, e.g. `Full run`, `2h 05m`, `5m`. */
export function formatWindowSpan(spanMs: number, fullSpanMs: number): string {
  if (!Number.isFinite(spanMs) || spanMs <= 0) return '0s';
  if (spanMs >= fullSpanMs) return 'Full run';
  const totalSeconds = Math.round(spanMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${String(minutes).padStart(2, '0')}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${minutes}m`;
  }
  return `${seconds}s`;
}
