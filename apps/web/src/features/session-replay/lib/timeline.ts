/**
 * Replay player model (#2341): reconstructs UI state at any offset, derives
 * timeline markers and breakpoints, detects recording gaps, and renders a
 * plain-text transcript of key events (the accessible alternative to
 * watching the replay).
 */

import type { ElementDescriptor, EventOf, ReplayEvent, ReplaySession } from '../capture/schema';

export type MarkerKind = 'error' | 'network' | 'navigation' | 'vital' | 'console' | 'interaction' | 'mark';
export type MarkerSeverity = 'error' | 'warn' | 'info';

export interface TimelineMarker {
  t: number;
  kind: MarkerKind;
  severity: MarkerSeverity;
  label: string;
  index: number;
}

export const POOR_VITALS: Record<string, number> = { LCP: 2_500, CLS: 0.1, INP: 200, FCP: 1_800, TTFB: 800 };

export function formatOffset(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function sortedEvents(session: Pick<ReplaySession, 'events'>): ReplayEvent[] {
  return session.events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.t - b.event.t || a.index - b.index)
    .map((entry) => entry.event);
}

function describeTarget(target: ElementDescriptor): string {
  const name = target.label ?? target.testId ?? target.id;
  return name ? `${target.tag} “${name}”` : target.selector;
}

export function describeEvent(event: ReplayEvent): string {
  switch (event.type) {
    case 'navigation':
      return event.kind === 'load' ? `Loaded ${event.route}` : `Navigated to ${event.route}`;
    case 'click':
      return `Clicked ${describeTarget(event.target)}`;
    case 'input':
      return `Edited ${describeTarget(event.target)} (${event.value !== undefined ? `“${event.value}”` : `${event.valueLength} chars, masked`})`;
    case 'submit':
      return `Submitted ${describeTarget(event.target)}`;
    case 'scroll':
      return `Scrolled to ${event.y}px`;
    case 'resize':
      return `Viewport ${event.width}×${event.height}`;
    case 'visibility':
      return event.state === 'hidden' ? 'Tab hidden' : 'Tab visible';
    case 'network':
      return `${event.method} ${event.url} → ${event.status === 0 ? 'network error' : event.status} in ${Math.round(event.durationMs)} ms${
        event.requestId ? ` (request ${event.requestId})` : ''
      }`;
    case 'console':
      return `console.${event.level}: ${event.message}`;
    case 'error':
      return `${event.source === 'unhandledrejection' ? 'Unhandled rejection' : event.source === 'boundary' ? 'Error boundary' : 'Error'}: ${event.message}`;
    case 'vital':
      return `${event.name} ${event.name === 'CLS' ? event.value.toFixed(3) : `${Math.round(event.value)} ms`}`;
    case 'state':
      return `State ${event.key}: ${event.summary}`;
    case 'flag':
      return `Feature flags: ${event.flags.join(', ') || 'none'}`;
    case 'mark':
      return `Mark: ${event.label}`;
  }
}

export function markersFor(session: Pick<ReplaySession, 'events'>): TimelineMarker[] {
  const markers: TimelineMarker[] = [];
  sortedEvents(session).forEach((event, index) => {
    const add = (kind: MarkerKind, severity: MarkerSeverity) => markers.push({ t: event.t, kind, severity, label: describeEvent(event), index });
    if (event.type === 'error') add('error', 'error');
    else if (event.type === 'console' && event.level !== 'info') add('console', event.level === 'error' ? 'error' : 'warn');
    else if (event.type === 'network' && (!event.ok || event.durationMs > 3_000)) add('network', event.ok ? 'warn' : 'error');
    else if (event.type === 'navigation') add('navigation', 'info');
    else if (event.type === 'vital' && event.value > (POOR_VITALS[event.name] ?? Infinity)) add('vital', 'warn');
    else if (event.type === 'click' || event.type === 'submit') add('interaction', 'info');
    else if (event.type === 'mark') add('mark', 'info');
  });
  return markers;
}

/** First marker strictly after `from` whose kind is enabled as a breakpoint. */
export function nextBreakpoint(markers: readonly TimelineMarker[], from: number, kinds: ReadonlySet<MarkerKind>): TimelineMarker | null {
  return markers.find((marker) => marker.t > from && kinds.has(marker.kind)) ?? null;
}

export function previousMarker(markers: readonly TimelineMarker[], from: number): TimelineMarker | null {
  for (let index = markers.length - 1; index >= 0; index -= 1) if (markers[index].t < from) return markers[index];
  return null;
}

export interface Gap {
  start: number;
  end: number;
}

/** Quiet periods longer than `threshold` (idle tab, lost batches): shown, and skippable. */
export function findGaps(session: Pick<ReplaySession, 'events' | 'durationMs'>, threshold = 15_000): Gap[] {
  const events = sortedEvents(session);
  const gaps: Gap[] = [];
  let previous = 0;
  for (const event of events) {
    if (event.t - previous > threshold) gaps.push({ start: previous, end: event.t });
    previous = event.t;
  }
  if (session.durationMs - previous > threshold) gaps.push({ start: previous, end: session.durationMs });
  return gaps;
}

export interface PlayerState {
  t: number;
  route: string;
  viewport: { width: number; height: number };
  scrollY: number;
  pointer: { x: number; y: number; recent: boolean; label: string } | null;
  lastInput: string | null;
  inFlight: Array<EventOf<'network'>>;
  network: Array<EventOf<'network'>>;
  errors: Array<EventOf<'error'> | EventOf<'console'>>;
  flags: string[];
  state: Record<string, string>;
  visible: boolean;
  vitals: Record<string, number>;
  /** Index of the last applied event in the sorted list, or -1. */
  cursor: number;
  inGap: boolean;
}

export function stateAt(session: ReplaySession, t: number, gaps: readonly Gap[] = []): PlayerState {
  const events = sortedEvents(session);
  const state: PlayerState = {
    t,
    route: session.entryRoute,
    viewport: { ...session.viewport },
    scrollY: 0,
    pointer: null,
    lastInput: null,
    inFlight: [],
    network: [],
    errors: [],
    flags: [],
    state: {},
    visible: true,
    vitals: {},
    cursor: -1,
    inGap: gaps.some((gap) => t > gap.start && t < gap.end),
  };
  for (const event of events.filter((candidate) => candidate.type === 'network')) {
    // Requests started but not finished at `t` (end time is `event.t`).
    const network = event as EventOf<'network'>;
    if (network.t > t && network.t - network.durationMs <= t) state.inFlight.push(network);
  }
  events.forEach((event, index) => {
    if (event.t > t) return;
    state.cursor = index;
    switch (event.type) {
      case 'navigation':
        state.route = event.route;
        state.scrollY = 0;
        break;
      case 'resize':
        state.viewport = { width: event.width, height: event.height };
        break;
      case 'scroll':
        state.scrollY = event.y;
        break;
      case 'click':
        state.pointer = { x: event.x, y: event.y, recent: t - event.t < 1_200, label: describeTarget(event.target) };
        break;
      case 'input':
        state.lastInput = describeEvent(event);
        break;
      case 'network':
        state.network.push(event);
        break;
      case 'error':
        state.errors.push(event);
        break;
      case 'console':
        if (event.level === 'error') state.errors.push(event);
        break;
      case 'flag':
        state.flags = event.flags;
        break;
      case 'state':
        state.state = { ...state.state, [event.key]: event.summary };
        break;
      case 'visibility':
        state.visible = event.state === 'visible';
        break;
      case 'vital':
        state.vitals = { ...state.vitals, [event.name]: event.value };
        break;
      default:
        break;
    }
  });
  return state;
}

/** Network request most plausibly behind an error: failed and finished within 2 s before it. */
export function correlatedRequest(session: ReplaySession, errorT: number): EventOf<'network'> | null {
  const candidates = session.events.filter(
    (event): event is EventOf<'network'> => event.type === 'network' && !event.ok && event.t <= errorT && errorT - event.t <= 2_000,
  );
  return candidates.sort((a, b) => b.t - a.t)[0] ?? null;
}

const TRANSCRIPT_TYPES = new Set<ReplayEvent['type']>(['navigation', 'click', 'input', 'submit', 'network', 'error', 'console', 'vital', 'state', 'mark']);

export function transcript(session: ReplaySession): Array<{ t: number; text: string; severity: MarkerSeverity }> {
  return sortedEvents(session)
    .filter((event) => {
      if (!TRANSCRIPT_TYPES.has(event.type)) return false;
      if (event.type === 'network') return !event.ok || event.method !== 'GET' || event.durationMs > 3_000;
      if (event.type === 'console') return event.level !== 'info';
      if (event.type === 'vital') return event.value > (POOR_VITALS[event.name] ?? Infinity);
      return true;
    })
    .map((event) => ({
      t: event.t,
      text: `${formatOffset(event.t)} ${describeEvent(event)}`,
      severity:
        event.type === 'error' || (event.type === 'network' && !event.ok) || (event.type === 'console' && event.level === 'error')
          ? 'error'
          : event.type === 'console' || event.type === 'vital' || event.type === 'network'
            ? 'warn'
            : 'info',
    }));
}

/** Links into backend correlation surfaces (#014/#075/#066). */
export function requestLogsHref(requestId: string): string {
  return `/logs?q=${encodeURIComponent(`"${requestId}"`)}`;
}

export function traceLogsHref(traceId: string): string {
  return `/logs?q=${encodeURIComponent(`trace_id:${traceId}`)}`;
}
