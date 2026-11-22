import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Structural contract for the scrubber. The behavioural math lives in
 * `timeline-view-utils.test.ts`; this suite guards the accessibility surface
 * (slider semantics, labelled lanes, keyboard map, live announcements) that
 * the e2e specs and W5-D06 depend on.
 */
const componentPath = path.resolve(process.cwd(), 'src/components/timeline/CampaignTimelineScrubber.tsx');
const source = fs.readFileSync(componentPath, 'utf-8');

describe('CampaignTimelineScrubber component contract', () => {
  it('is a client component exposing an accessible slider', () => {
    expect(source).toContain("'use client'");
    expect(source).toContain('role="slider"');
    expect(source).toContain('aria-label="Campaign timeline playhead"');
    expect(source).toContain('aria-orientation="horizontal"');
    expect(source).toContain('aria-valuemin={0}');
    expect(source).toContain('aria-valuemax={100}');
    expect(source).toContain('aria-valuenow={Math.round(playheadPercent)}');
    expect(source).toContain('aria-valuetext=');
  });

  it('implements the W5-D06 keyboard map', () => {
    for (const key of [
      "'ArrowLeft'",
      "'ArrowRight'",
      "'PageUp'",
      "'PageDown'",
      "'Home'",
      "'End'",
      "'+'",
      "'-'",
      "'0'",
    ]) {
      expect(source).toContain(key);
    }
    expect(source).toContain('event.shiftKey');
  });

  it('renders milestone and failure-density lanes with labelled controls', () => {
    expect(source).toContain('data-testid="timeline-marker-lane"');
    expect(source).toContain('data-testid="timeline-marker"');
    expect(source).toContain('data-marker-kind={marker.kind}');
    expect(source).toContain('data-testid="timeline-failure-lane"');
    expect(source).toContain('data-testid="timeline-failure-bar"');
    expect(source).toContain('Failures in selected window');
    expect(source).toContain('Failures in view');
  });

  it('links failures to their runs and announces live changes', () => {
    expect(source).toContain('`/runs/${encodeURIComponent(failure.runId)}`');
    expect(source).toContain('View run');
    expect(source).toContain('aria-live="polite"');
  });

  it('pauses live updates on interaction and exposes live/zoom controls', () => {
    expect(source).toContain('const pauseLive = useCallback');
    expect(source).toContain('setLivePausedLocally(true)');
    expect(source).toContain('onLiveChange?.(false)');
    expect(source).toContain('Zoom in');
    expect(source).toContain('Zoom out');
    expect(source).toContain('Reset');
    expect(source).toContain('aria-pressed={liveActive}');
    expect(source).toContain('MIN_TIMELINE_WINDOW_MS');
  });

  it('renders readouts and a graceful empty state', () => {
    expect(source).toContain('Seeds at playhead');
    expect(source).toContain('Failures at playhead');
    expect(source).toContain('Failure rate');
    expect(source).toContain('Seed throughput');
    expect(source).toContain('No timeline buckets available.');
  });
});
