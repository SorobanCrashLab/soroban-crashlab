/**
 * Release-job check that uploaded source maps resolve (#1889):
 * upload (done by `next build`) → send a synthetic event → fetch → assert.
 *
 * Run after `next build` with SENTRY_UPLOAD_SOURCEMAPS=true, from apps/web:
 *   node build/sentry-verify/scripts/verify-sentry-sourcemaps.js
 *
 * Env: NEXT_PUBLIC_SENTRY_DSN, SENTRY_AUTH_TOKEN (event:read), SENTRY_ORG,
 * SENTRY_PROJECT, SENTRY_RELEASE, optional SENTRY_URL (default
 * https://sentry.io; set it for self-hosted Sentry).
 *
 * Compiled with plain `tsc` (relative imports and Node built-ins only).
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildEnvelope,
  buildVerificationEvent,
  dsnEndpoint,
  extractDebugId,
  inspectResolvedFrame,
  locateMarker,
} from '../src/lib/integrations/sentry-sourcemap-verify';

/** A literal that only exists in CiRegressionResultsPanel.tsx (a client component). */
const MARKER = 'Unable to load CI regression results.';
const EXPECTED_SOURCE = 'CiRegressionResultsPanel';
const CHUNKS_DIR = path.join('.next', 'static', 'chunks');
const POLL_INTERVAL_MS = 5_000;
const POLL_ATTEMPTS = 36;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function listJs(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJs(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

async function main(): Promise<void> {
  const dsn = required('NEXT_PUBLIC_SENTRY_DSN');
  const token = required('SENTRY_AUTH_TOKEN');
  const org = required('SENTRY_ORG');
  const project = required('SENTRY_PROJECT');
  const release = required('SENTRY_RELEASE');
  const apiBase = (process.env.SENTRY_URL?.trim() || 'https://sentry.io').replace(/\/+$/, '');

  const chunk = listJs(CHUNKS_DIR).find((file) => fs.readFileSync(file, 'utf8').includes(MARKER));
  if (!chunk) throw new Error(`No client chunk under ${CHUNKS_DIR} contains the marker literal.`);
  const source = fs.readFileSync(chunk, 'utf8');
  const position = locateMarker(source, MARKER);
  const debugId = extractDebugId(source);
  if (!position || !debugId) throw new Error(`${chunk} has no debug id; were source maps uploaded?`);

  const codeFile = `app:///_next/static/chunks/${path.relative(CHUNKS_DIR, chunk).split(path.sep).join('/')}`;
  const now = new Date();
  const eventId = randomUUID().replace(/-/g, '');
  const event = buildVerificationEvent({ eventId, release, codeFile, debugId, position, now });
  const { envelopeUrl, publicKey } = dsnEndpoint(dsn);

  console.log(`Sending synthetic event ${eventId} for ${codeFile}:${position.lineno}:${position.colno} (debug id ${debugId})`);
  const sent = await fetch(envelopeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=crashlab-sourcemap-verify/1.0`,
    },
    body: buildEnvelope(event, dsn, now),
  });
  if (!sent.ok) throw new Error(`Envelope rejected: HTTP ${sent.status} ${await sent.text()}`);

  const eventUrl = `${apiBase}/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/events/${eventId}/`;
  for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const response = await fetch(eventUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 404) continue; // not processed yet
    if (!response.ok) throw new Error(`Event fetch failed: HTTP ${response.status}`);

    const { resolved, frame } = inspectResolvedFrame(await response.json(), EXPECTED_SOURCE);
    if (resolved) {
      console.log(`Frame resolved to ${frame?.filename ?? frame?.absPath}.`);
      return;
    }
    throw new Error(`Frame did not resolve to ${EXPECTED_SOURCE}: ${JSON.stringify(frame)}`);
  }
  throw new Error(`Event ${eventId} was not processed within ${(POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s.`);
}

main().catch((error: unknown) => {
  console.error(`::error::Source-map verification failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
