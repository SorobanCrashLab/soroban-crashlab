/**
 * Session replay capture schema (#2341).
 *
 * Replay is built from *structured UI events* rather than DOM snapshots:
 * route changes, interactions (with element descriptors, never raw markup),
 * network timing/status, console and error events, web vitals, feature
 * flags and app-provided state summaries. That keeps payloads small,
 * survives SPA re-renders, and makes redaction tractable: no field ever
 * holds free-form page content except short, masked labels.
 *
 * The zod schemas are the ingestion boundary; the server re-validates and
 * re-redacts every batch regardless of what the client claims to have done.
 */

import { z } from 'zod';

export const REPLAY_SCHEMA_VERSION = 1 as const;

export const LIMITS = {
  eventsPerBatch: 500,
  eventsPerSession: 20_000,
  labelChars: 80,
  messageChars: 500,
  stackChars: 2_000,
  urlChars: 500,
} as const;

const shortText = (max: number) => z.string().max(max);

export const elementDescriptorSchema = z
  .object({
    tag: shortText(20),
    id: shortText(80).optional(),
    testId: shortText(80).optional(),
    role: shortText(40).optional(),
    label: shortText(LIMITS.labelChars).optional(),
    selector: shortText(200),
  })
  .strict();

export type ElementDescriptor = z.infer<typeof elementDescriptorSchema>;

const t = z.number().int().min(0).max(7 * 86_400_000);

export const replayEventSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('navigation'),
      t,
      route: shortText(LIMITS.urlChars),
      from: shortText(LIMITS.urlChars).nullable(),
      kind: z.enum(['load', 'push', 'replace', 'pop']),
    })
    .strict(),
  z.object({ type: z.literal('click'), t, target: elementDescriptorSchema, x: z.number(), y: z.number() }).strict(),
  z
    .object({
      type: z.literal('input'),
      t,
      target: elementDescriptorSchema,
      valueLength: z.number().int().min(0).max(1_000_000),
      /** Only present for fields explicitly allow-listed with `data-replay-allow`. */
      value: shortText(LIMITS.labelChars).optional(),
    })
    .strict(),
  z.object({ type: z.literal('submit'), t, target: elementDescriptorSchema }).strict(),
  z.object({ type: z.literal('scroll'), t, x: z.number(), y: z.number() }).strict(),
  z.object({ type: z.literal('resize'), t, width: z.number().int().min(0), height: z.number().int().min(0) }).strict(),
  z.object({ type: z.literal('visibility'), t, state: z.enum(['visible', 'hidden']) }).strict(),
  z
    .object({
      type: z.literal('network'),
      t,
      id: shortText(40),
      method: shortText(10),
      url: shortText(LIMITS.urlChars),
      status: z.number().int().min(0).max(999),
      durationMs: z.number().min(0),
      ok: z.boolean(),
      requestId: shortText(120).nullable(),
      traceId: shortText(64).nullable(),
    })
    .strict(),
  z
    .object({ type: z.literal('console'), t, level: z.enum(['info', 'warn', 'error']), message: shortText(LIMITS.messageChars) })
    .strict(),
  z
    .object({
      type: z.literal('error'),
      t,
      source: z.enum(['error', 'unhandledrejection', 'boundary']),
      message: shortText(LIMITS.messageChars),
      stack: shortText(LIMITS.stackChars).optional(),
    })
    .strict(),
  z.object({ type: z.literal('vital'), t, name: z.enum(['LCP', 'CLS', 'INP', 'FCP', 'TTFB']), value: z.number() }).strict(),
  z.object({ type: z.literal('state'), t, key: shortText(60), summary: shortText(LIMITS.messageChars) }).strict(),
  z.object({ type: z.literal('flag'), t, flags: z.array(shortText(60)).max(50) }).strict(),
  z.object({ type: z.literal('mark'), t, label: shortText(LIMITS.labelChars) }).strict(),
]);

export type ReplayEvent = z.infer<typeof replayEventSchema>;
export type ReplayEventType = ReplayEvent['type'];
export type EventOf<T extends ReplayEventType> = Extract<ReplayEvent, { type: T }>;

export const sessionMetaSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{8,64}$/i),
    startedAt: z.string().refine((value) => Number.isFinite(Date.parse(value)), 'ISO timestamp'),
    userAgent: shortText(80),
    viewport: z.object({ width: z.number().int().min(0), height: z.number().int().min(0) }).strict(),
    entryRoute: shortText(LIMITS.urlChars),
    environment: z.enum(['development', 'preview', 'production', 'test']).default('development'),
    release: shortText(64).nullable().default(null),
    consent: z.enum(['granted', 'developer']),
    sampleRate: z.number().min(0).max(1),
  })
  .strict();

export type SessionMeta = z.infer<typeof sessionMetaSchema>;

export interface ReplaySession extends SessionMeta {
  version: typeof REPLAY_SCHEMA_VERSION;
  durationMs: number;
  events: ReplayEvent[];
  /** Events the client or server dropped (buffer overflow, size caps). */
  droppedEvents: number;
  issueLinks: string[];
  incidentIds: string[];
  source: 'captured' | 'demo';
}

export interface ReplaySessionSummary {
  id: string;
  startedAt: string;
  durationMs: number;
  entryRoute: string;
  routes: string[];
  eventCount: number;
  errorCount: number;
  failedRequests: number;
  environment: SessionMeta['environment'];
  source: ReplaySession['source'];
  issueLinks: string[];
  incidentIds: string[];
}

export function summarizeSession(session: ReplaySession): ReplaySessionSummary {
  const routes: string[] = [];
  let errorCount = 0;
  let failedRequests = 0;
  for (const event of session.events) {
    if (event.type === 'navigation' && routes[routes.length - 1] !== event.route) routes.push(event.route);
    if (event.type === 'error' || (event.type === 'console' && event.level === 'error')) errorCount += 1;
    if (event.type === 'network' && !event.ok) failedRequests += 1;
  }
  return {
    id: session.id,
    startedAt: session.startedAt,
    durationMs: session.durationMs,
    entryRoute: session.entryRoute,
    routes,
    eventCount: session.events.length,
    errorCount,
    failedRequests,
    environment: session.environment,
    source: session.source,
    issueLinks: session.issueLinks,
    incidentIds: session.incidentIds,
  };
}
