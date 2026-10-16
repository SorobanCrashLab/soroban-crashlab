/**
 * Alert dispatcher (#1892): dedup, ack/resolve lifecycle and escalation.
 *
 * Producers (nightly escalation, SLO burn) call `ingest`. The policy decides
 * the route; the dispatcher owns everything after that:
 *
 *  - dedup: an identical alert inside the route's window updates the open
 *    incident instead of opening another one;
 *  - lifecycle: triggered → acknowledged → resolved, from either side. A
 *    dashboard ack/resolve is pushed to the channels; a PagerDuty ack/resolve
 *    arrives through `applyRemoteStatus` and is not echoed back to PagerDuty;
 *  - escalation: `tick` fires the route's escalation steps for incidents still
 *    unacknowledged past the ack SLA, and releases notifications held by quiet
 *    hours once they end;
 *  - auto-resolve: `clear` resolves the open incident for a condition that has
 *    recovered, with a recovery note.
 *
 * The clock and the transport are injected, so every timing rule is testable
 * without waiting and without network.
 */

import {
  resolveRoute,
  isWithinQuietHours,
  type AlertChannel,
  type AlertEvent,
  type AlertPolicy,
  type AlertSeverity,
} from './alert-policy';

export type IncidentStatus = 'triggered' | 'acknowledged' | 'resolved';
export type LifecycleAction = 'trigger' | 'escalate' | 'acknowledge' | 'resolve';
export type LifecycleOrigin = 'dashboard' | 'pagerduty' | 'auto';

export interface Incident {
  id: string;
  dedupKey: string;
  routeId: string;
  source: string;
  severity: AlertSeverity;
  fingerprint: string;
  summary: string;
  status: IncidentStatus;
  occurrences: number;
  createdAt: string;
  lastSeenAt: string;
  /** Null while quiet hours hold the first notification. */
  notifiedAt: string | null;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
  /** Number of escalation steps already fired. */
  escalationLevel: number;
}

export interface AlertNotification {
  channel: AlertChannel;
  action: LifecycleAction;
  incident: Incident;
}

/** One method, one notification. Real and stub transports implement this. */
export interface AlertTransport {
  send(notification: AlertNotification): Promise<void>;
}

export interface IngestResult {
  incident: Incident;
  outcome: 'created' | 'deduplicated';
}

export interface AlertDispatcherOptions {
  policy: AlertPolicy;
  transport: AlertTransport;
  now?: () => Date;
  idFactory?: () => string;
}

const MINUTE_MS = 60_000;

export class AlertDispatcher {
  private readonly incidents = new Map<string, Incident>();
  private readonly policy: AlertPolicy;
  private readonly transport: AlertTransport;
  private readonly now: () => Date;
  private readonly idFactory: () => string;

  constructor(options: AlertDispatcherOptions) {
    this.policy = options.policy;
    this.transport = options.transport;
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? (() => `inc_${crypto.randomUUID()}`);
  }

  async ingest(event: AlertEvent): Promise<IngestResult> {
    const now = this.now();
    const decision = resolveRoute(this.policy, event, now);

    const open = this.findOpen(decision.dedupKey);
    if (open && now.getTime() - Date.parse(open.lastSeenAt) < decision.dedupWindowMinutes * MINUTE_MS) {
      open.occurrences += 1;
      open.lastSeenAt = now.toISOString();
      return { incident: { ...open }, outcome: 'deduplicated' };
    }

    const incident: Incident = {
      id: this.idFactory(),
      dedupKey: decision.dedupKey,
      routeId: decision.route.id,
      source: event.source,
      severity: event.severity,
      fingerprint: event.fingerprint,
      summary: event.summary,
      status: 'triggered',
      occurrences: 1,
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      notifiedAt: decision.held ? null : now.toISOString(),
      escalationLevel: 0,
    };
    this.incidents.set(incident.id, incident);

    if (!decision.held) await this.notify(decision.route.channels, 'trigger', incident);
    return { incident: { ...incident }, outcome: 'created' };
  }

  /** Dashboard (or other local) acknowledgement; propagated to the channels. */
  async acknowledge(id: string, actor: string): Promise<Incident> {
    return this.transition(id, 'acknowledged', actor, 'dashboard');
  }

  /** Dashboard resolution; propagated to the channels. */
  async resolve(id: string, actor: string, note?: string): Promise<Incident> {
    return this.transition(id, 'resolved', actor, 'dashboard', note);
  }

  /**
   * Status reported by PagerDuty (webhook). Reflected locally, then announced
   * on the route's non-PagerDuty channels — never echoed back to PagerDuty.
   */
  async applyRemoteStatus(dedupKey: string, status: 'acknowledged' | 'resolved', actor: string): Promise<Incident | null> {
    const open = this.findOpen(dedupKey);
    if (!open) return null;
    return this.transition(open.id, status, actor, 'pagerduty');
  }

  /** The condition behind `dedupKey` has recovered: auto-resolve with a note. */
  async clear(dedupKey: string, recoveryNote: string): Promise<Incident | null> {
    const open = this.findOpen(dedupKey);
    if (!open) return null;
    return this.transition(open.id, 'resolved', 'system', 'auto', `Recovered: ${recoveryNote}`);
  }

  /**
   * Periodic driver. Releases notifications held by quiet hours once they end
   * and fires escalation steps for incidents unacknowledged past the SLA.
   * Returns the notifications sent, for the caller's log.
   */
  async tick(): Promise<AlertNotification[]> {
    const now = this.now();
    const sent: AlertNotification[] = [];

    for (const incident of this.incidents.values()) {
      if (incident.status !== 'triggered') continue;
      const route = this.route(incident.routeId);

      if (incident.notifiedAt === null) {
        if (isWithinQuietHours(this.policy, now)) continue;
        incident.notifiedAt = now.toISOString();
        sent.push(...(await this.notify(route.channels, 'trigger', incident)));
        continue;
      }

      const elapsedMinutes = (now.getTime() - Date.parse(incident.notifiedAt)) / MINUTE_MS;
      while (incident.escalationLevel < route.escalation.length) {
        const step = route.escalation[incident.escalationLevel];
        if (elapsedMinutes < step.afterMinutes) break;
        incident.escalationLevel += 1;
        sent.push(...(await this.notify(step.channels, 'escalate', incident)));
      }
    }

    return sent;
  }

  /** Whether an incident is unacknowledged past its route's ack SLA. */
  isSlaBreached(incident: Incident): boolean {
    if (incident.status !== 'triggered' || incident.notifiedAt === null) return false;
    const route = this.route(incident.routeId);
    const sla = route.ackSlaMinutes ?? this.policy.defaults.ackSlaMinutes;
    return this.now().getTime() - Date.parse(incident.notifiedAt) >= sla * MINUTE_MS;
  }

  get(id: string): Incident | undefined {
    const incident = this.incidents.get(id);
    return incident ? { ...incident } : undefined;
  }

  list(): Incident[] {
    return [...this.incidents.values()]
      .map((incident) => ({ ...incident }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private findOpen(dedupKey: string): Incident | undefined {
    for (const incident of this.incidents.values()) {
      if (incident.dedupKey === dedupKey && incident.status !== 'resolved') return incident;
    }
    return undefined;
  }

  private route(routeId: string) {
    const route = this.policy.routes.find((candidate) => candidate.id === routeId);
    if (!route) throw new Error(`Route ${routeId} no longer exists in the policy`);
    return route;
  }

  private async transition(
    id: string,
    status: 'acknowledged' | 'resolved',
    actor: string,
    origin: LifecycleOrigin,
    note?: string,
  ): Promise<Incident> {
    const incident = this.incidents.get(id);
    if (!incident) throw new Error(`Unknown incident ${id}`);
    if (incident.status === 'resolved') return { ...incident };
    if (incident.status === status) return { ...incident };

    const at = this.now().toISOString();
    incident.status = status;
    if (status === 'acknowledged') {
      incident.acknowledgedAt = at;
      incident.acknowledgedBy = actor;
    } else {
      incident.resolvedAt = at;
      incident.resolvedBy = actor;
      if (note) incident.resolutionNote = note;
    }

    // Nothing was sent while held, so there is nothing to follow up on.
    if (incident.notifiedAt !== null) {
      const channels = this.route(incident.routeId).channels.filter(
        (channel) => !(origin === 'pagerduty' && channel === 'pagerduty'),
      );
      await this.notify(channels, status === 'acknowledged' ? 'acknowledge' : 'resolve', incident);
    }
    return { ...incident };
  }

  private async notify(
    channels: readonly AlertChannel[],
    action: LifecycleAction,
    incident: Incident,
  ): Promise<AlertNotification[]> {
    const sent: AlertNotification[] = [];
    for (const channel of new Set(channels)) {
      const notification = { channel, action, incident: { ...incident } };
      try {
        await this.transport.send(notification);
        sent.push(notification);
      } catch (error) {
        // One channel being down must not stop the others from paging.
        console.warn(`[alert-dispatcher] ${channel} ${action} failed for ${incident.id}:`, error);
      }
    }
    return sent;
  }
}
