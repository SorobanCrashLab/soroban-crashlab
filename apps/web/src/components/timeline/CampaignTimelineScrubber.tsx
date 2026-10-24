'use client';

/**
 * Campaign timeline scrubber (#1874).
 *
 * Three linked lanes share one time window:
 *  - milestone markers (start/pause/resume/cancel, checkpoints, workers, dictionaries)
 *  - a metric track with the draggable playhead and the metrics-at-playhead readout
 *  - a failure-density lane whose buckets click through to the individual crashes
 *
 * Keyboard contract (W5-D06): the track is a horizontal slider — arrows move
 * the playhead, Shift+arrows move further, PageUp/PageDown jump ten buckets,
 * Home/End jump to the range edges, +/- zoom, 0 resets the zoom. Any
 * interaction pauses live mode until the user turns it back on.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CampaignTimelineBucket,
  CampaignTimelineFailure,
  CampaignTimelineSeries,
} from '@/lib/campaigns/campaign-timeline';
import {
  MAX_TIMELINE_ZOOM_LEVEL,
  MIN_TIMELINE_WINDOW_MS,
  bucketAtTime,
  clampWindowToRange,
  formatFailureRate,
  formatSeedRate,
  formatTimelineClockForSeries,
  formatWindowSpan,
  fullTimelineWindow,
  nextZoomLevel,
  offsetPercent,
  parseTimelineTime,
  readoutAt,
  sliceBuckets,
  stepPlayheadMs,
  timeAtPercent,
  timelineWindowSpan,
  windowForBucket,
  windowForZoom,
  type TimelineWindow,
} from './timeline-view-utils';

export interface CampaignTimelineScrubberProps {
  series: CampaignTimelineSeries;
  /** Whether new samples should auto-advance the playhead. */
  live?: boolean;
  onLiveChange?: (live: boolean) => void;
  /** Fired when the playhead settles on a new position. */
  onScrub?: (at: string, bucket: CampaignTimelineBucket | null) => void;
  title?: string;
}

const FAILURE_LANE_LABEL = 'Failure density';
const MARKER_LANE_LABEL = 'Campaign milestones';

function clampToWindow(valueMs: number, window: TimelineWindow): number {
  return Math.min(window.endMs, Math.max(window.startMs, valueMs));
}

function percentForWindow(window: TimelineWindow, startMs: number, endMs: number): {
  left: number;
  width: number;
} {
  const span = timelineWindowSpan(window);
  if (span <= 0) return { left: 0, width: 0 };
  const left = Math.min(100, Math.max(0, ((startMs - window.startMs) / span) * 100));
  const right = Math.min(100, Math.max(0, ((endMs - window.startMs) / span) * 100));
  return { left, width: Math.max(0.4, right - left) };
}

export default function CampaignTimelineScrubber({
  series,
  live = false,
  onLiveChange,
  onScrub,
  title = 'Campaign timeline',
}: CampaignTimelineScrubberProps) {
  const full = useMemo(() => fullTimelineWindow(series), [series]);
  const fullSpan = timelineWindowSpan(full);

  const [zoomLevel, setZoomLevel] = useState(0);
  const [focusMs, setFocusMs] = useState(full.endMs);
  const [narrowWindow, setNarrowWindow] = useState<TimelineWindow | null>(null);
  const [selectedBucket, setSelectedBucket] = useState<CampaignTimelineBucket | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [livePausedLocally, setLivePausedLocally] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const trackRef = useRef<HTMLDivElement>(null);

  const liveActive = live && !livePausedLocally;

  // Keep the focus inside an updated range (e.g. after a live poll extends it).
  useEffect(() => {
    setFocusMs((current) => clampToWindow(current, full));
  }, [full]);

  // Live mode follows the newest sample unless the operator is scrubbing.
  useEffect(() => {
    if (!liveActive || scrubbing) return;
    setFocusMs(full.endMs);
    setNarrowWindow(null);
  }, [liveActive, scrubbing, full.endMs]);

  useEffect(() => {
    if (live) setLivePausedLocally(false);
  }, [live]);

  const viewWindow = useMemo(() => {
    if (narrowWindow) return clampWindowToRange(narrowWindow, full);
    return windowForZoom(full, zoomLevel, focusMs);
  }, [full, focusMs, narrowWindow, zoomLevel]);

  const viewWindowRef = useRef<TimelineWindow>(viewWindow);
  viewWindowRef.current = viewWindow;

  const visibleBuckets = useMemo(() => sliceBuckets(series, viewWindow), [series, viewWindow]);
  const maxFailures = useMemo(
    () => visibleBuckets.reduce((max, bucket) => Math.max(max, bucket.failures), 0),
    [visibleBuckets],
  );

  const visibleMarkers = useMemo(
    () =>
      series.markers.filter((marker) => {
        const at = parseTimelineTime(marker.at);
        return Number.isFinite(at) && at >= viewWindow.startMs && at <= viewWindow.endMs;
      }),
    [series.markers, viewWindow],
  );

  const readout = useMemo(() => readoutAt(series, focusMs), [series, focusMs]);
  const playheadPercent = offsetPercent(viewWindow, focusMs);
  const zoomLabel = formatWindowSpan(timelineWindowSpan(viewWindow), fullSpan);

  const selectedFailures = useMemo(() => {
    if (!selectedBucket) return [];
    const start = parseTimelineTime(selectedBucket.start);
    const end = parseTimelineTime(selectedBucket.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
    return series.failures.filter((failure) => {
      const at = parseTimelineTime(failure.at);
      return Number.isFinite(at) && at >= start && at < end;
    });
  }, [selectedBucket, series.failures]);

  const pauseLive = useCallback(() => {
    if (!live) return;
    setLivePausedLocally(true);
    onLiveChange?.(false);
  }, [live, onLiveChange]);

  const moveFocus = useCallback(
    (nextMs: number, options: { keepWindow?: boolean; announce?: string } = {}) => {
      const clamped = clampToWindow(nextMs, viewWindowRef.current);
      setFocusMs(clamped);
      if (!options.keepWindow) setNarrowWindow(null);
      if (options.announce) setAnnouncement(options.announce);
      onScrub?.(
        new Date(clamped).toISOString(),
        bucketAtTime(series, clamped),
      );
    },
    [onScrub, series],
  );

  const updateFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const percent = rect.width <= 0 ? 0 : ((clientX - rect.left) / rect.width) * 100;
      moveFocus(timeAtPercent(viewWindowRef.current, percent), { keepWindow: true });
    },
    [moveFocus],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    setScrubbing(true);
    pauseLive();
    updateFromClientX(event.clientX);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbing) return;
    updateFromClientX(event.clientX);
  };

  const finishScrubbing = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbing) return;
    setScrubbing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setAnnouncement(`Playhead at ${formatTimelineClockForSeries(series, focusMs)}`);
  };

  const zoom = useCallback(
    (direction: 1 | -1) => {
      pauseLive();
      setNarrowWindow(null);
      setZoomLevel((current) => {
        const next = nextZoomLevel(current, direction);
        const label = formatWindowSpan(
          timelineWindowSpan(windowForZoom(full, next, focusMs)),
          fullSpan,
        );
        setAnnouncement(`Timeline zoom: ${label}`);
        return next;
      });
    },
    [focusMs, full, fullSpan, pauseLive],
  );

  const resetZoom = useCallback(() => {
    pauseLive();
    setNarrowWindow(null);
    setZoomLevel(0);
    setAnnouncement('Timeline zoom reset to the full run');
  }, [pauseLive]);

  const toggleLive = () => {
    const next = !(live && !livePausedLocally);
    setLivePausedLocally(!next);
    onLiveChange?.(next);
    setAnnouncement(next ? 'Live updates resumed' : 'Live updates paused');
    if (next) setFocusMs(full.endMs);
  };

  const selectFailureBucket = (bucket: CampaignTimelineBucket) => {
    pauseLive();
    const bucketStart = parseTimelineTime(bucket.start);
    const bucketEnd = parseTimelineTime(bucket.end);
    const at = Number.isFinite(bucketStart) && Number.isFinite(bucketEnd)
      ? (bucketStart + bucketEnd) / 2
      : focusMs;
    setSelectedBucket(bucket);
    setNarrowWindow(windowForBucket(series, bucket));
    setFocusMs(at);
    setAnnouncement(
      `${bucket.failures} ${bucket.failures === 1 ? 'failure' : 'failures'} between ` +
        `${formatTimelineClockForSeries(series, bucketStart)} and ` +
        `${formatTimelineClockForSeries(series, bucketEnd)}`,
    );
    onScrub?.(new Date(at).toISOString(), bucket);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const span = timelineWindowSpan(viewWindowRef.current);
    const smallStep = Math.max(1_000, Math.round(span / 100));
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        pauseLive();
        moveFocus(focusMs - smallStep * (event.shiftKey ? 10 : 1));
        break;
      case 'ArrowRight':
        event.preventDefault();
        pauseLive();
        moveFocus(focusMs + smallStep * (event.shiftKey ? 10 : 1));
        break;
      case 'PageUp':
        event.preventDefault();
        pauseLive();
        moveFocus(stepPlayheadMs(series, focusMs, 10, viewWindowRef.current));
        break;
      case 'PageDown':
        event.preventDefault();
        pauseLive();
        moveFocus(stepPlayheadMs(series, focusMs, -10, viewWindowRef.current));
        break;
      case 'Home':
        event.preventDefault();
        pauseLive();
        moveFocus(full.startMs);
        break;
      case 'End':
        event.preventDefault();
        pauseLive();
        moveFocus(full.endMs);
        break;
      case '+':
      case '=':
        event.preventDefault();
        zoom(1);
        break;
      case '-':
      case '_':
        event.preventDefault();
        zoom(-1);
        break;
      case '0':
        event.preventDefault();
        resetZoom();
        break;
      default:
        break;
    }
  };

  if (series.bucketCount === 0) {
    return (
      <section aria-label={title} className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No timeline buckets available.</p>
      </section>
    );
  }

  const zoomInDisabled =
    zoomLevel >= MAX_TIMELINE_ZOOM_LEVEL ||
    timelineWindowSpan(viewWindow) <= MIN_TIMELINE_WINDOW_MS;

  const rangeLabel = `${formatTimelineClockForSeries(series, viewWindow.startMs)} – ${formatTimelineClockForSeries(
    series,
    viewWindow.endMs,
  )}`;

  return (
    <section
      aria-label={title}
      className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{title}</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            <span>{rangeLabel}</span>
            <span aria-hidden="true"> · </span>
            <span>{zoomLabel}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleLive}
            aria-pressed={liveActive}
            className={`rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors ${
              liveActive
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
            }`}
          >
            {liveActive ? 'Live' : 'Paused'}
          </button>
          <div role="group" aria-label="Timeline zoom" className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => zoom(-1)}
              disabled={zoomLevel === 0 && narrowWindow === null}
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm font-semibold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
            >
              Zoom out
            </button>
            <button
              type="button"
              onClick={() => zoom(1)}
              disabled={zoomInDisabled}
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm font-semibold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
            >
              Zoom in
            </button>
            <button
              type="button"
              onClick={resetZoom}
              disabled={zoomLevel === 0 && narrowWindow === null}
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm font-semibold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <div className="mt-5">
        <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          <span>{MARKER_LANE_LABEL}</span>
          <span>{visibleMarkers.length}</span>
        </div>
        <div
          aria-hidden={visibleMarkers.length === 0}
          data-testid="timeline-marker-lane"
          className="relative h-8 rounded-md bg-zinc-100 dark:bg-zinc-900"
        >
          {visibleMarkers.map((marker) => {
            const at = parseTimelineTime(marker.at);
            const left = offsetPercent(viewWindow, at);
            const clock = formatTimelineClockForSeries(series, at);
            return (
              <button
                key={marker.id}
                type="button"
                data-testid="timeline-marker"
                data-marker-kind={marker.kind}
                title={`${marker.label} — ${clock}`}
                aria-label={`${marker.label} at ${clock}`}
                onClick={() => {
                  pauseLive();
                  setFocusMs(at);
                  setAnnouncement(`${marker.label} at ${clock}`);
                  onScrub?.(new Date(at).toISOString(), bucketAtTime(series, at));
                }}
                className="absolute top-1 z-10 h-6 w-2 -translate-x-1/2 rounded-full bg-indigo-500 hover:bg-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                style={{ left: `${left}%` }}
              />
            );
          })}
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          <span>Metrics</span>
          <span>{readout.clock}</span>
        </div>

        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Campaign timeline playhead"
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(playheadPercent)}
          aria-valuetext={`${readout.clock}: ${readout.seeds} seeds, ${readout.failures} failures, ${formatFailureRate(
            readout.failureRate,
          )} failure rate`}
          data-testid="timeline-playhead-slider"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishScrubbing}
          onPointerCancel={finishScrubbing}
          onKeyDown={handleKeyDown}
          className="relative h-16 cursor-ew-resize touch-none overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div aria-hidden="true" className="absolute inset-0 flex items-stretch gap-px px-px">
            {visibleBuckets.map((bucket) => {
              const bucketStart = parseTimelineTime(bucket.start);
              const bucketEnd = parseTimelineTime(bucket.end);
              const { left, width } = percentForWindow(viewWindow, bucketStart, bucketEnd);
              const intensity = bucket.failureRate > 0 ? Math.min(0.85, 0.2 + bucket.failureRate) : 0.12;
              return (
                <span
                  key={bucket.start}
                  data-testid="timeline-bucket"
                  className="absolute bottom-0 top-0 bg-indigo-600"
                  style={{ left: `${left}%`, width: `${width}%`, opacity: intensity }}
                />
              );
            })}
          </div>
          <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-zinc-200 dark:bg-zinc-800" />
          <div
            aria-hidden="true"
            data-testid="timeline-playhead"
            className={`absolute inset-y-0 w-0.5 bg-rose-500 ${scrubbing ? 'transition-none' : 'transition-[left] duration-150'}`}
            style={{ left: `${playheadPercent}%` }}
          />
          <div
            aria-hidden="true"
            className="absolute top-1 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white bg-rose-500 shadow"
            style={{ left: `${playheadPercent}%` }}
          />
        </div>

        <div aria-hidden="true" className="mt-1 flex justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
          {[0, 25, 50, 75, 100].map((percent) => (
            <span key={percent}>
              {formatTimelineClockForSeries(series, timeAtPercent(viewWindow, percent))}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          <span>{FAILURE_LANE_LABEL}</span>
          <span>{series.failures.length} failures in range</span>
        </div>
        <div
          data-testid="timeline-failure-lane"
          className="relative h-12 rounded-md bg-zinc-100 dark:bg-zinc-900"
        >
          {visibleBuckets
            .filter((bucket) => bucket.failures > 0)
            .map((bucket) => {
              const bucketStart = parseTimelineTime(bucket.start);
              const bucketEnd = parseTimelineTime(bucket.end);
              const { left, width } = percentForWindow(viewWindow, bucketStart, bucketEnd);
              const height = maxFailures > 0 ? Math.max(12, (bucket.failures / maxFailures) * 100) : 12;
              return (
                <button
                  key={bucket.start}
                  type="button"
                  data-testid="timeline-failure-bar"
                  aria-label={`${bucket.failures} ${
                    bucket.failures === 1 ? 'failure' : 'failures'
                  } between ${formatTimelineClockForSeries(series, bucketStart)} and ${formatTimelineClockForSeries(
                    series,
                    bucketEnd,
                  )}`}
                  aria-pressed={selectedBucket?.start === bucket.start}
                  title={`${bucket.failures} failures · ${formatFailureRate(bucket.failureRate)} failure rate`}
                  onClick={() => selectFailureBucket(bucket)}
                  className="absolute bottom-0 rounded-t-sm bg-rose-500/80 hover:bg-rose-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                  style={{ left: `${left}%`, width: `${width}%`, height: `${height}%` }}
                />
              );
            })}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ReadoutCard label="Seeds at playhead" value={readout.seeds.toLocaleString()} />
        <ReadoutCard label="Failures at playhead" value={readout.failures.toLocaleString()} />
        <ReadoutCard label="Failure rate" value={formatFailureRate(readout.failureRate)} />
        <ReadoutCard label="Seed throughput" value={formatSeedRate(readout.seedsPerSecond)} />
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {selectedBucket ? 'Failures in selected window' : 'Failures in view'}
        </h3>
        <FailureList
          series={series}
          failures={
            selectedBucket
              ? selectedFailures
              : series.failures.filter((failure) => {
                  const at = parseTimelineTime(failure.at);
                  return Number.isFinite(at) && at >= viewWindow.startMs && at <= viewWindow.endMs;
                })
          }
        />
      </div>
    </section>
  );
}

function ReadoutCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
}

function FailureList({
  series,
  failures,
}: {
  series: CampaignTimelineSeries;
  failures: CampaignTimelineFailure[];
}) {
  if (failures.length === 0) {
    return (
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        No failures in this window. Scrub to a red bar to inspect a spike.
      </p>
    );
  }
  return (
    <ul className="mt-2 space-y-1" aria-label="Timeline failures">
      {failures.map((failure) => {
        const clock = formatTimelineClockForSeries(series, parseTimelineTime(failure.at));
        return (
          <li
            key={failure.id}
            data-testid="timeline-failure-item"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-800"
          >
            <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{clock}</span>
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">{failure.signature}</span>
            {failure.severity ? (
              <span className="rounded bg-rose-50 px-1.5 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                {failure.severity}
              </span>
            ) : null}
            {failure.runId ? (
              <a
                href={`/runs/${encodeURIComponent(failure.runId)}`}
                className="ml-auto text-xs font-semibold text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400"
              >
                View run
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
