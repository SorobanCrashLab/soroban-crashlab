'use client';

/**
 * Replay player (#2341): a reconstructed "stage" (route, viewport, pointer,
 * scroll, in-flight requests, latest error) driven by a scrubber with event
 * markers. Fully keyboard operable:
 *   Space / K  play–pause      ← / →  ±5 s      Shift+← / Shift+→  previous / next marker
 * Key events are announced in a polite live region while playing.
 */

import type { KeyboardEvent } from 'react';
import { SPEEDS, type SessionReplayState } from '../hooks/useSessionReplay';
import { formatOffset, type MarkerKind } from '../lib/timeline';

const BREAKPOINT_KINDS: Array<{ kind: MarkerKind; label: string }> = [
  { kind: 'error', label: 'Errors' },
  { kind: 'network', label: 'Failed / slow requests' },
  { kind: 'navigation', label: 'Navigation' },
  { kind: 'vital', label: 'Poor vitals' },
];

const MARKER_COLORS = { error: '#dc2626', warn: '#d97706', info: '#6b7280' } as const;

export function ReplayPlayer({ replay }: { replay: SessionReplayState }) {
  const { session, state } = replay;
  if (!session || !state) return null;
  const duration = Math.max(1, replay.duration);
  const scale = Math.min(1, 560 / Math.max(1, state.viewport.width));
  const stageWidth = Math.round(state.viewport.width * scale);
  const stageHeight = Math.round(state.viewport.height * scale);
  const latestError = state.errors[state.errors.length - 1];
  const announcement = state.errors.length > 0 && latestError && replay.t - latestError.t < 1_500 ? `Error at ${formatOffset(latestError.t)}: ${latestError.message}` : '';

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).tagName === 'INPUT' && (event.target as HTMLInputElement).type !== 'range') return;
    if (event.key === ' ' || event.key === 'k') {
      event.preventDefault();
      replay.toggle();
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      if (event.shiftKey) replay.stepMarker(direction);
      else replay.seek(replay.t + direction * 5_000);
    }
  };

  return (
    <section
      className="card card-padding flex flex-col gap-3 min-w-0"
      aria-label="Replay player"
      aria-keyshortcuts="Space ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight"
      onKeyDown={onKeyDown}
    >
      <div
        className="relative rounded border border-token overflow-hidden mx-auto surface-soft"
        style={{ width: stageWidth, height: stageHeight }}
        role="img"
        aria-label={`Reconstructed view at ${formatOffset(replay.t)}: ${state.route}${state.visible ? '' : ' (tab hidden)'}`}
      >
        <div className="absolute inset-x-0 top-0 px-2 py-1 text-xs font-mono truncate border-b border-token bg-token-surface">{state.route}</div>
        <div
          className="absolute right-1 w-1 rounded bg-blue-500 opacity-60"
          style={{ top: 24 + Math.min(stageHeight - 40, (state.scrollY / 4_000) * (stageHeight - 40)), height: 16 }}
          aria-hidden="true"
        />
        {state.pointer ? (
          <div
            className={`absolute rounded-full border-2 border-blue-500 ${state.pointer.recent ? 'w-6 h-6 -ml-3 -mt-3' : 'w-3 h-3 -ml-1.5 -mt-1.5 opacity-50'}`}
            style={{ left: state.pointer.x * scale, top: state.pointer.y * scale }}
            title={state.pointer.label}
            aria-hidden="true"
          />
        ) : null}
        {state.pointer?.recent ? (
          <div className="absolute left-2 bottom-8 text-xs px-2 py-1 rounded bg-token-elevated border border-token max-w-[80%] truncate">
            Click: {state.pointer.label}
          </div>
        ) : null}
        {state.inFlight.length > 0 ? (
          <div className="absolute right-2 top-8 text-xs px-2 py-1 rounded bg-token-elevated border border-token">⟳ {state.inFlight.length} request(s)</div>
        ) : null}
        {latestError && replay.t - latestError.t < 3_000 ? (
          <div className="absolute inset-x-2 bottom-2 text-xs px-2 py-1 rounded border border-red-500 bg-token-elevated truncate">✕ {latestError.message}</div>
        ) : null}
        {state.inGap ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-meta bg-token-surface">No events recorded in this period</div>
        ) : null}
        {!state.visible ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-meta">Tab hidden</div>
        ) : null}
      </div>

      <div className="relative">
        <label htmlFor="replay-scrubber" className="sr-only">
          Playback position
        </label>
        <input
          id="replay-scrubber"
          type="range"
          min={0}
          max={duration}
          step={100}
          value={replay.t}
          aria-valuetext={`${formatOffset(replay.t)} of ${formatOffset(duration)}`}
          onChange={(event) => replay.seek(Number(event.target.value))}
          className="w-full"
        />
        <div className="relative h-3" aria-hidden="true">
          {replay.gaps.map((gap) => (
            <span
              key={gap.start}
              className="absolute top-1 h-1 bg-token-border opacity-60"
              style={{ left: `${(gap.start / duration) * 100}%`, width: `${((gap.end - gap.start) / duration) * 100}%` }}
            />
          ))}
          {replay.markers
            .filter((marker) => marker.kind !== 'interaction')
            .map((marker) => (
              <button
                key={`${marker.index}-${marker.t}`}
                type="button"
                tabIndex={-1}
                className="absolute top-0 w-1.5 h-3 -ml-0.5 rounded-sm"
                style={{ left: `${(marker.t / duration) * 100}%`, background: MARKER_COLORS[marker.severity] }}
                title={`${formatOffset(marker.t)} ${marker.label}`}
                onClick={() => replay.seek(marker.t)}
              />
            ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary text-xs" onClick={replay.toggle} aria-label={replay.playing ? 'Pause' : 'Play'}>
          {replay.playing ? '❚❚ Pause' : '▶ Play'}
        </button>
        <button type="button" className="btn-outline text-xs" onClick={() => replay.stepMarker(-1)}>
          ◀ Prev event
        </button>
        <button type="button" className="btn-outline text-xs" onClick={() => replay.stepMarker(1)}>
          Next event ▶
        </button>
        <span className="text-sm font-mono" aria-live="off">
          {formatOffset(replay.t)} / {formatOffset(replay.duration)}
        </span>
        <label className="text-sm flex items-center gap-1">
          Speed
          <select className="input-field" value={replay.speed} onChange={(event) => replay.setSpeed(Number(event.target.value))}>
            {SPEEDS.map((speed) => (
              <option key={speed} value={speed}>
                {speed}×
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm flex items-center gap-1">
          <input type="checkbox" checked={replay.skipGaps} onChange={(event) => replay.setSkipGaps(event.target.checked)} />
          Skip idle gaps
        </label>
      </div>

      <fieldset className="flex flex-wrap gap-3 text-sm">
        <legend className="text-sm-medium">Pause on</legend>
        {BREAKPOINT_KINDS.map((entry) => (
          <label key={entry.kind} className="flex items-center gap-1">
            <input type="checkbox" checked={replay.breakpoints.includes(entry.kind)} onChange={() => replay.toggleBreakpoint(entry.kind)} />
            {entry.label}
          </label>
        ))}
      </fieldset>

      <p className="sr-only" role="status" aria-live="polite">
        {replay.playing ? announcement : replay.notice ?? ''}
      </p>
      {replay.notice ? <p className="text-meta text-sm">{replay.notice}</p> : null}
    </section>
  );
}
