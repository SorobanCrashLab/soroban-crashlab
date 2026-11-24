/**
 * Consent, privacy signals and the capture decision (#2341).
 *
 * Capture happens only when *all* of these hold:
 *  1. replay is enabled for the deployment (`NEXT_PUBLIC_CRASHLAB_SESSION_REPLAY=on`)
 *     or this browser opted into developer mode;
 *  2. the user explicitly granted consent (default is "not asked" = no capture);
 *  3. the browser sends no Global Privacy Control / Do-Not-Track signal;
 *  4. the route is not excluded (the replay viewer never records itself);
 *  5. the session is sampled in (developer mode always samples).
 *
 * `decideCapture` is pure so every branch is covered by tests.
 */

import { safeStorage } from '@/lib/local-storage';

export const CONSENT_KEY = 'crashlab.replay.consent';
export const DEV_MODE_KEY = 'crashlab.replay.devMode';

export type ConsentState = 'granted' | 'denied' | 'unset';

export const EXCLUDED_ROUTE_PREFIXES = ['/support/session-replay', '/settings/tokens', '/api/'] as const;

export interface ReplayConfig {
  enabled: boolean;
  sampleRate: number;
}

/** Build-time public config. `process.env.NEXT_PUBLIC_*` is inlined by Next.js. */
export function readReplayConfig(
  env: { enabled?: string; sampleRate?: string } = {
    enabled: process.env.NEXT_PUBLIC_CRASHLAB_SESSION_REPLAY,
    sampleRate: process.env.NEXT_PUBLIC_CRASHLAB_SESSION_REPLAY_SAMPLE_RATE,
  },
): ReplayConfig {
  const rate = Number(env.sampleRate);
  return {
    enabled: env.enabled === 'on',
    sampleRate: Number.isFinite(rate) && env.sampleRate !== undefined && env.sampleRate !== '' ? Math.min(1, Math.max(0, rate)) : 0.1,
  };
}

export interface PrivacySignals {
  globalPrivacyControl?: boolean;
  doNotTrack?: string | null;
}

export function privacySignalActive(signals: PrivacySignals | undefined): boolean {
  if (!signals) return false;
  return signals.globalPrivacyControl === true || signals.doNotTrack === '1' || signals.doNotTrack === 'yes';
}

export interface CaptureInputs {
  config: ReplayConfig;
  consent: ConsentState;
  developerMode: boolean;
  signals?: PrivacySignals;
  route: string;
  sampled: boolean;
}

export type CaptureDecision =
  | { record: true; mode: 'sampled' | 'developer' }
  | { record: false; reason: 'disabled' | 'no-consent' | 'privacy-signal' | 'excluded-route' | 'not-sampled' };

export function decideCapture(input: CaptureInputs): CaptureDecision {
  if (!input.config.enabled && !input.developerMode) return { record: false, reason: 'disabled' };
  if (input.consent !== 'granted') return { record: false, reason: 'no-consent' };
  if (privacySignalActive(input.signals)) return { record: false, reason: 'privacy-signal' };
  if (EXCLUDED_ROUTE_PREFIXES.some((prefix) => input.route.startsWith(prefix))) return { record: false, reason: 'excluded-route' };
  if (input.developerMode) return { record: true, mode: 'developer' };
  if (!input.sampled) return { record: false, reason: 'not-sampled' };
  return { record: true, mode: 'sampled' };
}

export function readConsent(): ConsentState {
  const value = safeStorage.getItem(CONSENT_KEY);
  return value === 'granted' || value === 'denied' ? value : 'unset';
}

export function writeConsent(state: Exclude<ConsentState, 'unset'>): void {
  safeStorage.setItem(CONSENT_KEY, state);
  notify();
}

export function readDeveloperMode(): boolean {
  return safeStorage.getItem(DEV_MODE_KEY) === '1';
}

export function writeDeveloperMode(enabled: boolean): void {
  if (enabled) safeStorage.setItem(DEV_MODE_KEY, '1');
  else safeStorage.removeItem(DEV_MODE_KEY);
  notify();
}

const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((listener) => listener());
}

/** For `useSyncExternalStore` in the consent UI. */
export function subscribePrivacy(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function privacySnapshot(): string {
  return `${readConsent()}|${readDeveloperMode() ? '1' : '0'}`;
}
