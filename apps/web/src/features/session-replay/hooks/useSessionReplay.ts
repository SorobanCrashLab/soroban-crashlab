'use client';

/**
 * Replay loading and playback clock (#2341).
 *
 * The clock runs on requestAnimationFrame while playing and advances by
 * wall-time × speed. Enabled breakpoint kinds pause playback exactly at the
 * marker; "skip gaps" jumps over idle periods. `tRef` is the clock's source
 * of truth and is only touched from effects and event handlers.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { downloadTextFile } from '@/app/utils/browser-download';
import type { ReplaySession } from '../capture/schema';
import { bugReportMarkdown } from '../lib/bundle';
import { findGaps, markersFor, nextBreakpoint, previousMarker, stateAt, type MarkerKind } from '../lib/timeline';

export const SPEEDS = [0.5, 1, 2, 4, 8] as const;
export const DEFAULT_BREAKPOINTS: MarkerKind[] = ['error'];

interface Loaded {
  key: string;
  session: ReplaySession | null;
  access: string | null;
  error: string | null;
  viewer: { role: string; canShare: boolean; canViewCaptured: boolean } | null;
}

export interface UseSessionReplayOptions {
  id?: string;
  shareToken?: string | null;
  /** A locally imported bundle: no network access at all. */
  session?: ReplaySession;
}

export function useSessionReplay({ id, shareToken, session: localSession }: UseSessionReplayOptions) {
  const key = localSession ? `local:${localSession.id}` : `${id}|${shareToken ?? ''}`;
  const [loaded, setLoaded] = useState<Loaded>({ key: '', session: null, access: null, error: null, viewer: null });
  const [revision, setRevision] = useState(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [breakpoints, setBreakpoints] = useState<MarkerKind[]>(DEFAULT_BREAKPOINTS);
  const [skipGaps, setSkipGaps] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const tRef = useRef(0);

  useEffect(() => {
    if (localSession || !id) return;
    let cancelled = false;
    const query = new URLSearchParams({ id });
    if (shareToken) query.set('share', shareToken);
    fetch(`/api/session-replay?${query.toString()}`)
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as {
          data?: { session: ReplaySession; access: string; viewer: Loaded['viewer'] };
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok || !body.data) {
          setLoaded({ key, session: null, access: null, viewer: null, error: body.error ?? `Request failed (${response.status}).` });
          return;
        }
        setLoaded({ key, session: body.data.session, access: body.data.access, viewer: body.data.viewer, error: null });
      })
      .catch((error: Error) => {
        if (!cancelled) setLoaded({ key, session: null, access: null, viewer: null, error: error.message });
      });
    return () => {
      cancelled = true;
    };
  }, [id, key, localSession, revision, shareToken]);

  const session = localSession ?? (loaded.key === key ? loaded.session : null);
  const loading = !localSession && loaded.key !== key;
  const markers = useMemo(() => (session ? markersFor(session) : []), [session]);
  const gaps = useMemo(() => (session ? findGaps(session) : []), [session]);
  const state = useMemo(() => (session ? stateAt(session, t, gaps) : null), [gaps, session, t]);
  const duration = session?.durationMs ?? 0;

  const seek = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(duration, Math.round(next)));
      tRef.current = clamped;
      setT(clamped);
    },
    [duration],
  );

  useEffect(() => {
    if (!playing || !session) return;
    const kinds = new Set(breakpoints);
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const from = tRef.current;
      let to = from + (now - last) * speed;
      last = now;
      if (skipGaps) {
        const gap = gaps.find((candidate) => to > candidate.start && to < candidate.end);
        if (gap) to = gap.end;
      }
      const hit = nextBreakpoint(markers, from, kinds);
      if (hit && hit.t <= to) {
        tRef.current = hit.t;
        setT(hit.t);
        setPlaying(false);
        setNotice(`Paused at breakpoint: ${hit.label}`);
        return;
      }
      if (to >= session.durationMs) {
        tRef.current = session.durationMs;
        setT(session.durationMs);
        setPlaying(false);
        return;
      }
      tRef.current = to;
      setT(Math.round(to));
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [breakpoints, gaps, markers, playing, session, skipGaps, speed]);

  const play = useCallback(() => {
    if (!session) return;
    if (tRef.current >= session.durationMs) seek(0);
    setNotice(null);
    setPlaying(true);
  }, [seek, session]);

  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => (playing ? pause() : play()), [pause, play, playing]);

  const stepMarker = useCallback(
    (direction: 1 | -1) => {
      setPlaying(false);
      const target = direction === 1 ? markers.find((marker) => marker.t > tRef.current) : previousMarker(markers, tRef.current);
      if (target) seek(target.t);
    },
    [markers, seek],
  );

  const toggleBreakpoint = useCallback((kind: MarkerKind) => {
    setBreakpoints((previous) => (previous.includes(kind) ? previous.filter((item) => item !== kind) : [...previous, kind]));
  }, []);

  const share = useCallback(
    async (ttlMinutes: number) => {
      if (!session) return null;
      const response = await fetch('/api/session-replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'share', sessionId: session.id, ttlMinutes }),
      });
      const body = (await response.json().catch(() => ({}))) as { data?: { url: string; expiresAt: string }; error?: string };
      if (!response.ok || !body.data) {
        setNotice(body.error ?? 'Could not create a share link.');
        return null;
      }
      const url = `${window.location.origin}${body.data.url}`;
      setNotice(`Share link valid until ${body.data.expiresAt}.`);
      return { url, expiresAt: body.data.expiresAt };
    },
    [session],
  );

  const link = useCallback(
    async (input: { issue?: string; incident?: string }) => {
      if (!session) return;
      const response = await fetch('/api/session-replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'link', sessionId: session.id, ...input }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setNotice(response.ok ? 'Link added.' : body.error ?? 'Could not add the link.');
      if (response.ok) setRevision((value) => value + 1);
    },
    [session],
  );

  const downloadBugReport = useCallback(() => {
    if (!session) return;
    downloadTextFile(bugReportMarkdown(session, typeof window === 'undefined' ? undefined : window.location.href), `replay-${session.id}.md`, 'text/markdown');
  }, [session]);

  return {
    session,
    loading,
    error: localSession ? null : loaded.key === key ? loaded.error : null,
    access: localSession ? 'local' : loaded.access,
    viewer: loaded.viewer,
    markers,
    gaps,
    state,
    t,
    duration,
    playing,
    speed,
    setSpeed,
    breakpoints,
    toggleBreakpoint,
    skipGaps,
    setSkipGaps,
    notice,
    setNotice,
    seek,
    play,
    pause,
    toggle,
    stepMarker,
    share,
    link,
    downloadBugReport,
  };
}

export type SessionReplayState = ReturnType<typeof useSessionReplay>;
