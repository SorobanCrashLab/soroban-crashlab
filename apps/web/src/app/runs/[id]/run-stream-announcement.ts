/**
 * Pure text for run-stream announcements (#1884).
 *
 * The run detail page used to refresh silently over SSE: a screen-reader user
 * had no idea the status changed or that the stream had dropped frames. Keep
 * the phrasing here so it is unit-testable and consistent.
 */

import type { RunStreamPayload } from '@/lib/run-stream';
import type { RunStatus } from '@/app/types';

export function runStreamAnnouncement(
  event: RunStreamPayload,
  previousStatus?: RunStatus,
): string | null {
  switch (event.type) {
    case 'RUN_STATUS':
    case 'STATIC': {
      if (event.status === previousStatus) return null;
      return `Run status changed to ${event.status}.`;
    }
    case 'LAGGING':
      return `Live updates skipped ${event.dropped} ${
        event.dropped === 1 ? 'event' : 'events'
      }; the view may be behind.`;
    default:
      return null;
  }
}

export function streamConnectionAnnouncement(
  previousConnected: boolean,
  connected: boolean,
): string | null {
  if (previousConnected === connected) return null;
  return connected
    ? 'Live updates connected.'
    : 'Live updates disconnected; reconnecting.';
}
