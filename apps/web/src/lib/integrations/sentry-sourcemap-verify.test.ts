import { describe, expect, it } from 'vitest';
import {
  buildEnvelope,
  buildVerificationEvent,
  dsnEndpoint,
  extractDebugId,
  inspectResolvedFrame,
  locateMarker,
} from './sentry-sourcemap-verify';

const DEBUG_ID = '1a2b3c4d-1111-2222-3333-444455556666';

describe('sentry source-map verification helpers', () => {
  it('locates a literal as a 1-based line and column', () => {
    const chunk = 'a=1;\nfunction f(){throw Error("Unable to load")}\n';
    expect(locateMarker(chunk, 'Unable to load')).toEqual({ lineno: 2, colno: 27 });
    expect(locateMarker(chunk, 'missing')).toBeNull();
  });

  it('reads the debug id from the comment or the injected snippet', () => {
    expect(extractDebugId(`x;\n//# debugId=${DEBUG_ID.toUpperCase()}\n`)).toBe(DEBUG_ID);
    expect(extractDebugId(`e._sentryDebugIds[n]="${DEBUG_ID}",e._sentryDebugIdIdentifier="x"`)).toBe(DEBUG_ID);
    expect(extractDebugId('no id here')).toBeNull();
  });

  it('derives the envelope endpoint for SaaS and self-hosted DSNs', () => {
    expect(dsnEndpoint('https://key@o1.ingest.sentry.io/42')).toEqual({
      envelopeUrl: 'https://o1.ingest.sentry.io/api/42/envelope/',
      publicKey: 'key',
    });
    expect(dsnEndpoint('http://k@sentry.internal:9000/prefix/7').envelopeUrl).toBe(
      'http://sentry.internal:9000/prefix/api/7/envelope/',
    );
    expect(() => dsnEndpoint('https://sentry.io/42')).toThrow();
  });

  it('builds an event whose frame and debug image point at the chunk', () => {
    const now = new Date('2026-10-16T00:00:00.000Z');
    const event = buildVerificationEvent({
      eventId: 'e'.repeat(32),
      release: 'r1',
      codeFile: 'app:///_next/static/chunks/a.js',
      debugId: DEBUG_ID,
      position: { lineno: 1, colno: 99 },
      now,
    });
    expect(event).toMatchObject({
      release: 'r1',
      debug_meta: { images: [{ type: 'sourcemap', code_file: 'app:///_next/static/chunks/a.js', debug_id: DEBUG_ID }] },
      exception: { values: [{ stacktrace: { frames: [{ abs_path: 'app:///_next/static/chunks/a.js', lineno: 1, colno: 99 }] } }] },
    });
    const lines = buildEnvelope(event, 'https://k@h/1', now).split('\n');
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[1])).toEqual({ type: 'event' });
    expect(JSON.parse(lines[0]).event_id).toBe('e'.repeat(32));
  });

  it('asserts the top frame resolved to the original source', () => {
    const apiEvent = (filename: string) => ({
      entries: [{ type: 'exception', data: { values: [{ stacktrace: { frames: [{ filename }] } }] } }],
    });
    expect(
      inspectResolvedFrame(apiEvent('./src/app/integrations/ci-replay/CiRegressionResultsPanel.tsx'), 'CiRegressionResultsPanel')
        .resolved,
    ).toBe(true);
    expect(inspectResolvedFrame(apiEvent('app:///_next/static/chunks/a.js'), 'CiRegressionResultsPanel').resolved).toBe(false);
    expect(inspectResolvedFrame({ entries: [] }, 'x')).toEqual({ resolved: false, frame: null });
  });
});
