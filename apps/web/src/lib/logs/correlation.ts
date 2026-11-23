/**
 * Correlation jump-links from log events (#066/#068/#072/#075).
 *
 * Links are derived from structured fields on the event. They are plain URLs
 * so they work with Next `<Link>`, middle-click, and copy/share without a
 * client-side navigation dependency.
 */

import type { LogEvent } from './types';

export type CorrelationKind = 'run' | 'campaign' | 'trace' | 'span' | 'incident' | 'artifact' | 'state' | 'contract';

export interface CorrelationLink {
  id: string;
  kind: CorrelationKind;
  label: string;
  href: string;
  description: string;
}

function encode(value: string): string {
  return encodeURIComponent(value);
}

function makeLink(
  event: LogEvent,
  kind: CorrelationKind,
  label: string,
  href: string,
  description: string,
): CorrelationLink {
  return { id: `${event.id}:${kind}`, kind, label, href, description };
}

/** All available correlation actions for one event, ordered by usefulness. */
export function buildCorrelationLinks(event: LogEvent): CorrelationLink[] {
  const links: CorrelationLink[] = [];

  if (event.trace_id) {
    links.push(makeLink(
      event, 'trace', `Trace ${event.trace_id}`,
      `/replay?traceId=${encode(event.trace_id)}`,
      'Open the replay/trace inspector for this distributed trace.',
    ));
  }
  if (event.span_id) {
    links.push(makeLink(
      event, 'span', `Span ${event.span_id}`,
      `/replay?traceId=${encode(event.trace_id ?? '')}&spanId=${encode(event.span_id)}`,
      'Jump to the span node within its trace.',
    ));
  }
  if (event.run_id) {
    links.push(makeLink(
      event, 'run', `Run ${event.run_id}`,
      `/runs/${encode(event.run_id)}`,
      'Open the run detail for the emitting fuzzing run.',
    ));
    links.push(makeLink(
      event, 'state', 'State snapshot',
      `/runs/${encode(event.run_id)}/state`,
      'Inspect ledger state changes recorded for this run.',
    ));
  }
  if (event.campaign_id) {
    links.push(makeLink(
      event, 'campaign', `Campaign ${event.campaign_id}`,
      `/campaigns/${encode(event.campaign_id)}`,
      'Open the campaign that produced this event.',
    ));
  }
  if (event.incident_id) {
    links.push(makeLink(
      event, 'incident', `Incident ${event.incident_id}`,
      `/incidents/${encode(event.incident_id)}`,
      'Open the linked incident record.',
    ));
  }
  if (event.artifact_id) {
    links.push(makeLink(
      event, 'artifact', `Artifact ${event.artifact_id}`,
      `/artifacts/${encode(event.artifact_id)}`,
      'Open the stored artifact attached to this event.',
    ));
  }
  if (event.contract) {
    links.push(makeLink(
      event, 'contract', `Contract ${event.contract}`,
      `/contracts?contract=${encode(event.contract)}`,
      'Filter contracts by the identifier on this event.',
    ));
  }

  return links;
}

/** Deduplicated links for a set of selected events. */
export function buildCorrelationLinksForEvents(events: LogEvent[]): CorrelationLink[] {
  const byHref = new Map<string, CorrelationLink>();
  for (const event of events) {
    for (const link of buildCorrelationLinks(event)) {
      if (!byHref.has(link.href)) byHref.set(link.href, link);
    }
  }
  return [...byHref.values()];
}

/** Build a `/logs` link preloaded with a correlation query for the given field. */
export function relatedLogsLink(
  field: 'run_id' | 'campaign_id' | 'trace_id' | 'error_code',
  value: string,
): string {
  return `/logs?query=${encode(`${field}:${value}`)}`;
}
