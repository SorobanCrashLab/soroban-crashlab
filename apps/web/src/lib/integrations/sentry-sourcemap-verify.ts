/**
 * Source-map verification for the Sentry release job (#1889):
 * upload → send a synthetic event → fetch it back → assert a frame resolved.
 *
 * The event's single frame points at a string literal from our own source
 * inside a built client chunk, at the exact line/column where the literal sits
 * in the minified file, with the chunk's debug id in `debug_meta`. If the
 * release's source maps were uploaded correctly, Sentry rewrites that frame to
 * the original file (e.g. CiRegressionResultsPanel.tsx); if not, the frame
 * keeps pointing at the minified chunk and the job fails.
 *
 * Pure helpers only; apps/web/scripts/verify-sentry-sourcemaps.ts does the I/O.
 */

export interface MarkerPosition {
  /** 1-based line in the minified chunk. */
  lineno: number;
  /** 1-based column (Sentry's convention). */
  colno: number;
}

export function locateMarker(source: string, marker: string): MarkerPosition | null {
  const index = source.indexOf(marker);
  if (index < 0) return null;
  const before = source.slice(0, index);
  const lineStart = before.lastIndexOf('\n') + 1;
  return { lineno: before.split('\n').length, colno: index - lineStart + 1 };
}

const DEBUG_ID = '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})';

/**
 * The chunk's debug id, from the `//# debugId=` comment or the runtime
 * `_sentryDebugIds[...] = "<id>"` snippet the Sentry bundler plugin injects.
 */
export function extractDebugId(source: string): string | null {
  const comment = new RegExp(`//# debugId=${DEBUG_ID}`).exec(source);
  if (comment) return comment[1].toLowerCase();
  const snippet = new RegExp(`_sentryDebugIds\\[[^\\]]+\\]\\s*=\\s*["']${DEBUG_ID}["']`).exec(source);
  return snippet ? snippet[1].toLowerCase() : null;
}

export interface DsnEndpoint {
  envelopeUrl: string;
  publicKey: string;
}

/** `https://<key>@<host>[/<prefix>]/<project>` → the project's envelope endpoint. */
export function dsnEndpoint(dsn: string): DsnEndpoint {
  const url = new URL(dsn);
  const match = /^(.*)\/(\d+)$/.exec(url.pathname);
  if (!url.username || !match) throw new Error('DSN must look like https://<key>@<host>/<project id>.');
  return {
    envelopeUrl: `${url.protocol}//${url.host}${match[1]}/api/${match[2]}/envelope/`,
    publicKey: url.username,
  };
}

export function buildVerificationEvent(input: {
  eventId: string;
  release: string;
  codeFile: string;
  debugId: string;
  position: MarkerPosition;
  now: Date;
}): Record<string, unknown> {
  return {
    event_id: input.eventId,
    timestamp: input.now.getTime() / 1000,
    platform: 'javascript',
    level: 'info',
    release: input.release,
    environment: 'sourcemap-verification',
    exception: {
      values: [
        {
          type: 'SourceMapVerification',
          value: `Synthetic frame for release ${input.release}`,
          stacktrace: {
            frames: [
              {
                abs_path: input.codeFile,
                filename: input.codeFile,
                function: '?',
                lineno: input.position.lineno,
                colno: input.position.colno,
                in_app: true,
              },
            ],
          },
        },
      ],
    },
    debug_meta: { images: [{ type: 'sourcemap', code_file: input.codeFile, debug_id: input.debugId }] },
  };
}

export function buildEnvelope(event: Record<string, unknown>, dsn: string, now: Date): string {
  return [
    JSON.stringify({ event_id: event.event_id, dsn, sent_at: now.toISOString() }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify(event),
  ].join('\n');
}

interface ApiFrame {
  filename?: string | null;
  absPath?: string | null;
  module?: string | null;
}

/**
 * Finds the event's top frame in the Sentry API response and reports whether
 * it resolved to `expectedSource` (a fragment of the original file path).
 */
export function inspectResolvedFrame(
  apiEvent: unknown,
  expectedSource: string,
): { resolved: boolean; frame: ApiFrame | null } {
  const entries = (apiEvent as { entries?: Array<{ type?: string; data?: unknown }> } | null)?.entries ?? [];
  const exception = entries.find((entry) => entry.type === 'exception')?.data as
    | { values?: Array<{ stacktrace?: { frames?: ApiFrame[] } | null }> }
    | undefined;
  const frames = exception?.values?.[0]?.stacktrace?.frames ?? [];
  const frame = frames.at(-1) ?? null;
  if (!frame) return { resolved: false, frame: null };
  const paths = [frame.filename, frame.absPath, frame.module].filter((p): p is string => typeof p === 'string');
  return { resolved: paths.some((p) => p.includes(expectedSource)), frame };
}
