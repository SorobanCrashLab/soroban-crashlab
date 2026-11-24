/**
 * Replay reproduction bundles (#2341): a self-contained, redacted, versioned
 * JSON file attachable to bug reports, plus a Markdown summary. Bundles are
 * validated with the same schema as ingestion and carry a checksum so a
 * hand-edited bundle is recognised as such on import.
 */

import { z } from 'zod';
import { scrubEvent } from '../capture/redaction';
import { LIMITS, REPLAY_SCHEMA_VERSION, replayEventSchema, sessionMetaSchema, type ReplaySession } from '../capture/schema';
import { correlatedRequest, formatOffset, requestLogsHref, transcript } from './timeline';

export const BUNDLE_SCHEMA = 'crashlab.replay-bundle/v1';

export interface ReplayBundle {
  schema: typeof BUNDLE_SCHEMA;
  exportedAt: string;
  checksum: string;
  session: ReplaySession;
}

/** Key-sorted JSON so the checksum ignores property order (zod re-orders on parse). */
function stableJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === 'object') {
      return Object.fromEntries(
        Object.keys(input as Record<string, unknown>)
          .sort()
          .map((key) => [key, normalize((input as Record<string, unknown>)[key])]),
      );
    }
    return input;
  };
  return JSON.stringify(normalize(value));
}

function checksumOf(value: unknown): string {
  const text = stableJson(value);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ code, 0x811c9dc5) >>> 0;
  }
  return `fnv64:${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export function buildBundle(session: ReplaySession, now: Date = new Date()): ReplayBundle {
  // Re-scrub on export: bundles leave the system, so they get the strictest pass.
  const clean: ReplaySession = { ...session, events: session.events.map(scrubEvent) };
  return { schema: BUNDLE_SCHEMA, exportedAt: now.toISOString(), checksum: checksumOf(clean), session: clean };
}

const sessionSchema = sessionMetaSchema.extend({
  version: z.literal(REPLAY_SCHEMA_VERSION),
  durationMs: z.number().min(0),
  events: z.array(replayEventSchema).max(LIMITS.eventsPerSession),
  droppedEvents: z.number().int().min(0),
  issueLinks: z.array(z.string().max(500)).max(20),
  incidentIds: z.array(z.string().max(80)).max(20),
  source: z.enum(['captured', 'demo']),
});

const bundleSchema = z
  .object({ schema: z.literal(BUNDLE_SCHEMA), exportedAt: z.string(), checksum: z.string(), session: sessionSchema })
  .strict();

export type BundleParse =
  | { ok: true; bundle: ReplayBundle; checksumValid: boolean }
  | { ok: false; errors: string[] };

export function parseBundle(text: string): BundleParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['Bundle is not valid JSON.'] };
  }
  const parsed = bundleSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join('.')}: ${issue.message}`) };
  }
  const bundle = parsed.data as ReplayBundle;
  // Imported sessions are re-scrubbed too: a bundle may come from anywhere.
  const session: ReplaySession = { ...bundle.session, events: bundle.session.events.map(scrubEvent) };
  return { ok: true, bundle: { ...bundle, session }, checksumValid: checksumOf(bundle.session) === bundle.checksum };
}

export function bugReportMarkdown(session: ReplaySession, shareUrl?: string): string {
  const failed = session.events.filter((event) => event.type === 'network' && !event.ok);
  const errors = session.events.filter((event) => event.type === 'error');
  const lines = [
    `## Session replay ${session.id}`,
    '',
    `- Started: ${session.startedAt} · duration ${formatOffset(session.durationMs)}`,
    `- Environment: ${session.environment}${session.release ? ` · release ${session.release}` : ''} · ${session.userAgent} · ${session.viewport.width}×${session.viewport.height}`,
    `- Entry route: \`${session.entryRoute}\``,
    ...(shareUrl ? [`- Replay: ${shareUrl}`] : []),
    '',
    '### Errors',
    ...(errors.length === 0
      ? ['_none_']
      : errors.map((event) => {
          const request = correlatedRequest(session, event.t);
          return `- ${formatOffset(event.t)} ${event.type === 'error' ? event.message : ''}${request?.requestId ? ` (after ${request.method} ${request.url} → ${request.status}, request \`${request.requestId}\`)` : ''}`;
        })),
    '',
    '### Failed requests',
    ...(failed.length === 0
      ? ['_none_']
      : failed.map((event) =>
          event.type === 'network'
            ? `- ${formatOffset(event.t)} ${event.method} \`${event.url}\` → ${event.status || 'network error'}${event.requestId ? ` · [logs](${requestLogsHref(event.requestId)})` : ''}`
            : '',
        )),
    '',
    '### Steps (transcript)',
    ...transcript(session).map((entry) => `- ${entry.text}`),
    '',
    `_Inputs are masked; ${session.droppedEvents} event(s) were dropped during capture._`,
  ];
  return lines.join('\n');
}
