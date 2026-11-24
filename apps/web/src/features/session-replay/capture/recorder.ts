/**
 * Structured-event recorder (#2341).
 *
 * Everything it touches is injected (`RecorderEnv`), so it runs unchanged
 * against `window` in the browser and against plain fakes in tests. Listeners
 * are passive and capture-phase; history and fetch are wrapped only while
 * recording and restored exactly on `stop()`. Nothing runs until `start()`.
 *
 * Overhead controls: scroll/resize are throttled, the buffer is bounded
 * (overflow is counted, not silently lost), and request/response bodies and
 * headers are never read — only method, redacted URL, status, timing and the
 * allow-listed correlation headers.
 */

import { describeElement, DEFAULT_RULES, isValueAllowed, maskText, redactUrl, type ElementLike, type RedactionRules } from './redaction';
import { LIMITS, type ReplayEvent } from './schema';

type Listener = (event: Event) => void;

export interface EventTargetLike {
  addEventListener(type: string, listener: Listener, options?: AddEventListenerOptions | boolean): void;
  removeEventListener(type: string, listener: Listener, options?: EventListenerOptions | boolean): void;
}

export interface HistoryLike {
  pushState(data: unknown, unused: string, url?: string | URL | null): void;
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
}

export interface RecorderEnv {
  window: EventTargetLike;
  document?: EventTargetLike & { visibilityState?: string };
  history?: HistoryLike;
  console?: Pick<Console, 'warn' | 'error'>;
  fetchHost?: { fetch: typeof fetch };
  location: { pathname: string; search: string; origin: string };
  viewport(): { width: number; height: number };
  scroll(): { x: number; y: number };
  now(): number;
  observeVitals?(callback: (metric: { name: 'LCP' | 'CLS'; value: number }) => void): () => void;
}

export interface RecorderOptions {
  rules?: RedactionRules;
  maxEvents?: number;
  throttleMs?: number;
  /** URLs (prefix match on pathname) that must not be recorded, e.g. the ingest endpoint. */
  ignoreUrls?: readonly string[];
  onEvent?(event: ReplayEvent): void;
}

export interface Recorder {
  start(): void;
  stop(): void;
  isRecording(): boolean;
  /** Developer marks and app state summaries (e.g. "triage filter: open"). */
  mark(label: string): void;
  recordState(key: string, summary: string): void;
  recordFlags(flags: readonly string[]): void;
  recordBoundaryError(error: unknown): void;
  events(): ReplayEvent[];
  /** Hand buffered events to the transport and clear them. */
  drain(): ReplayEvent[];
  droppedEvents(): number;
  startedAt(): number;
}

const REQUEST_ID_HEADERS = ['x-request-id', 'x-correlation-id'];

function traceIdFrom(traceparent: string | null): string | null {
  const match = traceparent?.match(/^[0-9a-f]{2}-([0-9a-f]{32})-/i);
  return match ? match[1] : null;
}

function errorMessage(value: unknown): { message: string; stack?: string } {
  if (value instanceof Error) return { message: value.message || value.name, stack: value.stack };
  if (typeof value === 'string') return { message: value };
  try {
    return { message: JSON.stringify(value) ?? String(value) };
  } catch {
    return { message: String(value) };
  }
}

export function createRecorder(env: RecorderEnv, options: RecorderOptions = {}): Recorder {
  const rules = options.rules ?? DEFAULT_RULES;
  const maxEvents = options.maxEvents ?? 5_000;
  const throttleMs = options.throttleMs ?? 250;
  const ignore = options.ignoreUrls ?? [];
  let buffer: ReplayEvent[] = [];
  const all: ReplayEvent[] = [];
  let dropped = 0;
  let recording = false;
  let origin = 0;
  let lastRoute = '';
  let networkSeq = 0;
  const cleanups: Array<() => void> = [];
  const lastThrottled: Record<string, number> = {};

  const rel = () => Math.max(0, Math.round(env.now() - origin));
  const currentRoute = () => redactUrl(`${env.location.pathname}${env.location.search}`, env.location.origin);

  const push = (event: ReplayEvent) => {
    if (!recording) return;
    if (all.length >= maxEvents) {
      dropped += 1;
      return;
    }
    buffer.push(event);
    all.push(event);
    options.onEvent?.(event);
  };

  const throttled = (key: string) => {
    const now = env.now();
    if (now - (lastThrottled[key] ?? -Infinity) < throttleMs) return false;
    lastThrottled[key] = now;
    return true;
  };

  const navigation = (kind: 'load' | 'push' | 'replace' | 'pop') => {
    const route = currentRoute();
    if (kind !== 'load' && route === lastRoute) return;
    push({ type: 'navigation', t: rel(), route, from: lastRoute || null, kind });
    lastRoute = route;
  };

  const listen = (target: EventTargetLike | undefined, type: string, listener: Listener) => {
    if (!target) return;
    const options = { capture: true, passive: true };
    target.addEventListener(type, listener, options);
    cleanups.push(() => target.removeEventListener(type, listener, { capture: true }));
  };

  const elementOf = (event: Event): ElementLike | null => {
    const target = event.target as unknown as ElementLike | null;
    return target && typeof target === 'object' ? target : null;
  };

  const start = () => {
    if (recording) return;
    recording = true;
    origin = env.now();
    lastRoute = '';
    const viewport = env.viewport();
    navigation('load');
    push({ type: 'resize', t: 0, width: Math.round(viewport.width), height: Math.round(viewport.height) });

    listen(env.window, 'click', (event) => {
      const element = elementOf(event);
      if (!element) return;
      const pointer = event as unknown as { clientX?: number; clientY?: number };
      push({ type: 'click', t: rel(), target: describeElement(element, rules), x: Math.round(pointer.clientX ?? 0), y: Math.round(pointer.clientY ?? 0) });
    });
    listen(env.window, 'change', (event) => {
      const element = elementOf(event) as (ElementLike & { value?: unknown }) | null;
      if (!element) return;
      const raw = typeof element.value === 'string' ? element.value : '';
      push({
        type: 'input',
        t: rel(),
        target: describeElement(element, rules),
        valueLength: raw.length,
        ...(isValueAllowed(element, rules) ? { value: maskText(raw, LIMITS.labelChars) } : {}),
      });
    });
    listen(env.window, 'submit', (event) => {
      const element = elementOf(event);
      if (element) push({ type: 'submit', t: rel(), target: describeElement(element, rules) });
    });
    listen(env.window, 'scroll', () => {
      if (!throttled('scroll')) return;
      const position = env.scroll();
      push({ type: 'scroll', t: rel(), x: Math.round(position.x), y: Math.round(position.y) });
    });
    listen(env.window, 'resize', () => {
      if (!throttled('resize')) return;
      const size = env.viewport();
      push({ type: 'resize', t: rel(), width: Math.round(size.width), height: Math.round(size.height) });
    });
    listen(env.window, 'popstate', () => navigation('pop'));
    listen(env.window, 'error', (event) => {
      const errorEvent = event as unknown as { error?: unknown; message?: string };
      const { message, stack } = errorMessage(errorEvent.error ?? errorEvent.message ?? 'Script error');
      push({ type: 'error', t: rel(), source: 'error', message: maskText(message), ...(stack ? { stack: maskText(stack, LIMITS.stackChars) } : {}) });
    });
    listen(env.window, 'unhandledrejection', (event) => {
      const { message, stack } = errorMessage((event as unknown as { reason?: unknown }).reason);
      push({ type: 'error', t: rel(), source: 'unhandledrejection', message: maskText(message), ...(stack ? { stack: maskText(stack, LIMITS.stackChars) } : {}) });
    });
    listen(env.document, 'visibilitychange', () => {
      push({ type: 'visibility', t: rel(), state: env.document?.visibilityState === 'hidden' ? 'hidden' : 'visible' });
    });

    if (env.history) {
      const history = env.history;
      const originalPush = history.pushState;
      const originalReplace = history.replaceState;
      history.pushState = function pushState(this: HistoryLike, ...args) {
        originalPush.apply(this, args);
        navigation('push');
      };
      history.replaceState = function replaceState(this: HistoryLike, ...args) {
        originalReplace.apply(this, args);
        navigation('replace');
      };
      cleanups.push(() => {
        history.pushState = originalPush;
        history.replaceState = originalReplace;
      });
    }

    if (env.console) {
      const target = env.console;
      const originalWarn = target.warn;
      const originalError = target.error;
      const wrap = (level: 'warn' | 'error', original: (...args: unknown[]) => void) =>
        function wrapped(this: unknown, ...args: unknown[]) {
          push({ type: 'console', t: rel(), level, message: maskText(args.map((arg) => errorMessage(arg).message).join(' ')) });
          original.apply(this, args);
        };
      target.warn = wrap('warn', originalWarn);
      target.error = wrap('error', originalError);
      cleanups.push(() => {
        target.warn = originalWarn;
        target.error = originalError;
      });
    }

    if (env.fetchHost) {
      const host = env.fetchHost;
      const originalFetch = host.fetch;
      host.fetch = async function recordedFetch(input: RequestInfo | URL, init?: RequestInit) {
        const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
        const pathname = (() => {
          try {
            return new URL(rawUrl, env.location.origin).pathname;
          } catch {
            return rawUrl;
          }
        })();
        if (!recording || ignore.some((prefix) => pathname.startsWith(prefix))) return originalFetch(input, init);
        const startedAt = env.now();
        networkSeq += 1;
        const id = `req-${networkSeq}`;
        const url = redactUrl(rawUrl, env.location.origin);
        try {
          const response = await originalFetch(input, init);
          const headers = response.headers;
          const requestId = REQUEST_ID_HEADERS.map((name) => headers?.get?.(name) ?? null).find(Boolean) ?? null;
          push({
            type: 'network',
            t: rel(),
            id,
            method,
            url,
            status: response.status,
            ok: response.ok,
            durationMs: Math.round(env.now() - startedAt),
            requestId: requestId ? requestId.slice(0, 120) : null,
            traceId: traceIdFrom(headers?.get?.('traceparent') ?? null),
          });
          return response;
        } catch (error) {
          push({ type: 'network', t: rel(), id, method, url, status: 0, ok: false, durationMs: Math.round(env.now() - startedAt), requestId: null, traceId: null });
          throw error;
        }
      } as typeof fetch;
      cleanups.push(() => {
        host.fetch = originalFetch;
      });
    }

    if (env.observeVitals) {
      cleanups.push(env.observeVitals((metric) => push({ type: 'vital', t: rel(), name: metric.name, value: metric.value })));
    }
  };

  const stop = () => {
    if (!recording) return;
    while (cleanups.length > 0) cleanups.pop()!();
    recording = false;
  };

  return {
    start,
    stop,
    isRecording: () => recording,
    mark: (label) => push({ type: 'mark', t: rel(), label: maskText(label, LIMITS.labelChars) }),
    recordState: (key, summary) => push({ type: 'state', t: rel(), key: key.slice(0, 60), summary: maskText(summary) }),
    recordFlags: (flags) => push({ type: 'flag', t: rel(), flags: flags.slice(0, 50).map((flag) => flag.slice(0, 60)) }),
    recordBoundaryError: (error) => {
      const { message, stack } = errorMessage(error);
      push({ type: 'error', t: rel(), source: 'boundary', message: maskText(message), ...(stack ? { stack: maskText(stack, LIMITS.stackChars) } : {}) });
    },
    events: () => [...all],
    drain: () => {
      const out = buffer;
      buffer = [];
      return out;
    },
    droppedEvents: () => dropped,
    startedAt: () => origin,
  };
}

/** Deterministic sampling: the same session id always gets the same decision. */
export function sampledIn(sessionId: string, rate: number): boolean {
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  let h = 0x811c9dc5;
  for (let index = 0; index < sessionId.length; index += 1) h = Math.imul(h ^ sessionId.charCodeAt(index), 0x01000193) >>> 0;
  return h / 0x1_0000_0000 < rate;
}

export function now(): number {
  return typeof performance !== 'undefined' ? performance.timeOrigin + performance.now() : Date.now();
}

/** Adapter for the real browser; only called from the client host. */
export function browserEnv(): RecorderEnv {
  return {
    window,
    document,
    history: window.history,
    console: window.console,
    fetchHost: window,
    location: window.location,
    viewport: () => ({ width: window.innerWidth, height: window.innerHeight }),
    scroll: () => ({ x: window.scrollX, y: window.scrollY }),
    now,
  };
}
