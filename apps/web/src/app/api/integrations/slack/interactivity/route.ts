/**
 * POST /api/integrations/slack/interactivity
 *
 * Slack's Request URL for triage button clicks (#1428). Slack allows 3 seconds
 * for a response, so this route verifies the signature, acknowledges with an
 * empty 200, and lets the triage work run after the response is handed back.
 *
 * Infrastructure assumption: HTTP Request URL only. Socket mode is not
 * supported, so this route must be reachable from Slack.
 *
 * `SLACK_SIGNING_SECRET` comes from the environment and is never logged.
 */

import { NextResponse } from 'next/server';
import { createRouteHandler } from '@/lib/route-handler';
import {
  createInMemoryTriageStore,
  handleInteractivityRequest,
  type TriageStore,
} from '@/lib/integrations/slack-interactivity';

// Triage state lives in module scope for the life of the server process, the
// same shape the Slack thread mapping uses before a backing store is wired in.
let store: TriageStore | null = null;

function getTriageStore(): TriageStore {
  if (!store) store = createInMemoryTriageStore();
  return store;
}

export const POST = createRouteHandler(
  {
    label: 'POST /api/integrations/slack/interactivity',
  },
  async (request: Request) => {
    // The raw body is what Slack signed; parsing it first would break the HMAC.
    const body = await request.text();

    const ack = handleInteractivityRequest(
      {
        body,
        signature: request.headers.get('x-slack-signature'),
        timestamp: request.headers.get('x-slack-request-timestamp'),
      },
      {
        secret: process.env.SLACK_SIGNING_SECRET,
        store: getTriageStore(),
        nowSeconds: Math.floor(Date.now() / 1000),
        // Deferred rather than awaited: the response goes out first.
        defer: (task) => {
          void Promise.resolve().then(task);
        },
      },
    );

    return new NextResponse(ack.body, {
      status: ack.status,
      headers: ack.reason ? { 'X-Slack-Reject-Reason': ack.reason } : undefined,
    });
  }
);
