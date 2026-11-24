/**
 * Browser capture host (#2341). Loaded only by `SessionReplayBootstrap`
 * after it confirmed replay is enabled (or developer mode is on), so a
 * deployment with replay off never downloads this module.
 *
 * One capture per tab. Sampled sessions stream to the ingest API; developer
 * mode keeps events in memory only (unless the deployment also enables
 * upload), so a maintainer can export a local reproduction bundle without
 * sending anything anywhere.
 */

import { getEnabledFlags } from '@/lib/flags';
import { observeVitals } from '@/lib/perf/vitals';
import {
  decideCapture,
  readConsent,
  readDeveloperMode,
  readReplayConfig,
  subscribePrivacy,
  type CaptureDecision,
} from '../privacy/consent';
import { browserEnv, createRecorder, newSessionId, sampledIn, type Recorder } from './recorder';
import { REPLAY_SCHEMA_VERSION, type ReplaySession, type SessionMeta } from './schema';
import { createTransport, INGEST_ENDPOINT, type Transport } from './transport';

interface ActiveCapture {
  meta: SessionMeta;
  recorder: Recorder;
  transport: Transport | null;
  decision: CaptureDecision;
  stop(): void;
}

let active: ActiveCapture | null = null;
let lastDecision: CaptureDecision = { record: false, reason: 'disabled' };

function browserFamily(userAgent: string): string {
  if (/Edg\//.test(userAgent)) return 'Edge';
  if (/Firefox\//.test(userAgent)) return 'Firefox';
  if (/Chrome\//.test(userAgent)) return 'Chrome';
  if (/Safari\//.test(userAgent)) return 'Safari';
  return 'Other';
}

function environment(): SessionMeta['environment'] {
  const vercel = process.env.NEXT_PUBLIC_VERCEL_ENV;
  if (vercel === 'production') return 'production';
  if (vercel === 'preview') return 'preview';
  return process.env.NODE_ENV === 'production' ? 'production' : 'development';
}

export function startReplayCapture(): CaptureDecision {
  if (active) return active.decision;
  const config = readReplayConfig();
  const developerMode = readDeveloperMode();
  let id: string;
  try {
    id = newSessionId();
  } catch {
    // No CSPRNG: never fall back to guessable ids — just don't record.
    lastDecision = { record: false, reason: 'disabled' };
    return lastDecision;
  }
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  const decision = decideCapture({
    config,
    consent: readConsent(),
    developerMode,
    signals: { globalPrivacyControl: nav.globalPrivacyControl, doNotTrack: nav.doNotTrack },
    route: window.location.pathname,
    sampled: sampledIn(id, config.sampleRate),
  });
  lastDecision = decision;
  if (!decision.record) return decision;

  const meta: SessionMeta = {
    id,
    startedAt: new Date().toISOString(),
    userAgent: browserFamily(navigator.userAgent),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    entryRoute: window.location.pathname,
    environment: environment(),
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE ?? null,
    consent: decision.mode === 'developer' ? 'developer' : 'granted',
    sampleRate: decision.mode === 'developer' ? 1 : config.sampleRate,
  };
  const transport = config.enabled ? createTransport(meta) : null;
  const recorder = createRecorder(
    { ...browserEnv(), observeVitals },
    { ignoreUrls: [INGEST_ENDPOINT], onEvent: transport ? () => transport.enqueue(recorder.drain()) : undefined },
  );
  recorder.start();
  recorder.recordFlags(getEnabledFlags());

  const onHide = () => {
    if (document.visibilityState === 'hidden') transport?.flushOnHide();
  };
  document.addEventListener('visibilitychange', onHide);
  // Withdrawing consent stops capture immediately.
  const unsubscribe = subscribePrivacy(() => {
    if (readConsent() !== 'granted') stopReplayCapture();
  });

  active = {
    meta,
    recorder,
    transport,
    decision,
    stop: () => {
      document.removeEventListener('visibilitychange', onHide);
      unsubscribe();
      recorder.stop();
      transport?.flushOnHide();
      transport?.dispose();
    },
  };
  return decision;
}

export function stopReplayCapture(): void {
  active?.stop();
  active = null;
}

export function captureStatus(): { recording: boolean; decision: CaptureDecision; sessionId: string | null; events: number } {
  return {
    recording: Boolean(active?.recorder.isRecording()),
    decision: active?.decision ?? lastDecision,
    sessionId: active?.meta.id ?? null,
    events: active?.recorder.events().length ?? 0,
  };
}

/** The in-memory recording as a session, for developer-mode bundles. */
export function activeSession(): ReplaySession | null {
  if (!active) return null;
  const events = active.recorder.events();
  return {
    ...active.meta,
    version: REPLAY_SCHEMA_VERSION,
    durationMs: events.length > 0 ? events[events.length - 1].t : 0,
    events,
    droppedEvents: active.recorder.droppedEvents() + (active.transport?.dropped() ?? 0),
    issueLinks: [],
    incidentIds: [],
    source: 'captured',
  };
}

/** App hooks: error boundaries and stateful screens can annotate the replay. */
export function replayAnnotate(kind: 'mark' | 'state' | 'error', key: string, value?: unknown): void {
  if (!active) return;
  if (kind === 'mark') active.recorder.mark(key);
  else if (kind === 'state') active.recorder.recordState(key, String(value ?? ''));
  else active.recorder.recordBoundaryError(value ?? key);
}
