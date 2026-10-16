/**
 * Alert routing policy (#1892).
 *
 * The policy lives in `ops/alert-policies.yml`. This module owns its schema and
 * the pure routing decision: which route an alert takes, what its dedup key is,
 * and whether quiet hours hold its notifications. Nothing here sends anything —
 * that is the dispatcher's job — so the routing matrix is testable on its own.
 */

import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

export const ALERT_SEVERITIES = ['critical', 'error', 'warning', 'info'] as const;
export const ALERT_CHANNELS = ['pagerduty', 'slack', 'email'] as const;
export const DEDUP_KEY_FIELDS = ['source', 'severity', 'fingerprint'] as const;

export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];
export type AlertChannel = (typeof ALERT_CHANNELS)[number];
export type DedupKeyField = (typeof DEDUP_KEY_FIELDS)[number];

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const positiveMinutes = z.number().int().positive();

const EscalationStepSchema = z.object({
  afterMinutes: positiveMinutes,
  channels: z.array(z.enum(ALERT_CHANNELS)).min(1),
});

const RouteSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'route id must be kebab-case'),
  match: z.object({
    source: z.string().min(1),
    severity: z.array(z.enum(ALERT_SEVERITIES)).min(1),
  }),
  channels: z.array(z.enum(ALERT_CHANNELS)).min(1),
  dedupKey: z.array(z.enum(DEDUP_KEY_FIELDS)).min(1),
  dedupWindowMinutes: positiveMinutes.optional(),
  ackSlaMinutes: positiveMinutes.optional(),
  respectQuietHours: z.boolean(),
  escalation: z.array(EscalationStepSchema),
});

export const AlertPolicySchema = z
  .object({
    version: z.literal(1),
    defaults: z.object({
      dedupWindowMinutes: positiveMinutes,
      ackSlaMinutes: positiveMinutes,
    }),
    quietHours: z
      .object({
        start: z.string().regex(HH_MM, 'quietHours.start must be HH:MM'),
        end: z.string().regex(HH_MM, 'quietHours.end must be HH:MM'),
      })
      .optional(),
    routes: z.array(RouteSchema).min(1),
  })
  .superRefine((policy, ctx) => {
    const seen = new Set<string>();
    policy.routes.forEach((route, index) => {
      if (seen.has(route.id)) {
        ctx.addIssue({ code: 'custom', path: ['routes', index, 'id'], message: `duplicate route id "${route.id}"` });
      }
      seen.add(route.id);

      // Escalation is the response to a missed ack SLA, so it cannot start first.
      const ackSla = route.ackSlaMinutes ?? policy.defaults.ackSlaMinutes;
      if (route.escalation.length > 0 && route.escalation[0].afterMinutes < ackSla) {
        ctx.addIssue({
          code: 'custom',
          path: ['routes', index, 'escalation', 0, 'afterMinutes'],
          message: `first escalation (${route.escalation[0].afterMinutes}m) precedes the ack SLA (${ackSla}m)`,
        });
      }

      let previous = 0;
      route.escalation.forEach((step, stepIndex) => {
        if (step.afterMinutes <= previous) {
          ctx.addIssue({
            code: 'custom',
            path: ['routes', index, 'escalation', stepIndex, 'afterMinutes'],
            message: 'escalation steps must be strictly increasing',
          });
        }
        previous = step.afterMinutes;
      });
    });

    const last = policy.routes.at(-1);
    if (last && (last.match.source !== '*' || last.match.severity.length !== ALERT_SEVERITIES.length)) {
      ctx.addIssue({
        code: 'custom',
        path: ['routes', policy.routes.length - 1],
        message: 'the last route must be a catch-all (source "*", every severity)',
      });
    }
  });

export type AlertPolicy = z.infer<typeof AlertPolicySchema>;
export type AlertRoute = AlertPolicy['routes'][number];

export interface AlertEvent {
  /** Producer, e.g. `nightly-escalation`, `slo-burn`. */
  source: string;
  severity: AlertSeverity;
  /** Stable identity of the condition (signature, SLO name, ...). */
  fingerprint: string;
  summary: string;
  details?: Record<string, unknown>;
}

export interface RoutingDecision {
  route: AlertRoute;
  dedupKey: string;
  dedupWindowMinutes: number;
  ackSlaMinutes: number;
  /** True when quiet hours hold notifications for this route at `now`. */
  held: boolean;
}

/** Throws with every schema violation listed, so CI output is actionable. */
export function parseAlertPolicy(source: string): AlertPolicy {
  const result = AlertPolicySchema.safeParse(parseYaml(source));
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`);
    throw new Error(`Invalid alert policy:\n  ${problems.join('\n  ')}`);
  }
  return result.data;
}

export function buildDedupKey(route: AlertRoute, event: AlertEvent): string {
  return [route.id, ...route.dedupKey.map((field) => event[field])].join(':');
}

function minutesOfDay(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Quiet hours are UTC and may wrap midnight (22:00–07:00). */
export function isWithinQuietHours(policy: AlertPolicy, now: Date): boolean {
  if (!policy.quietHours) return false;
  const start = minutesOfDay(policy.quietHours.start);
  const end = minutesOfDay(policy.quietHours.end);
  const current = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (start === end) return false;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export function resolveRoute(policy: AlertPolicy, event: AlertEvent, now: Date): RoutingDecision {
  const route = policy.routes.find(
    (candidate) =>
      (candidate.match.source === '*' || candidate.match.source === event.source) &&
      candidate.match.severity.includes(event.severity),
  );
  // The schema guarantees a catch-all, so this only fires on a hand-built policy.
  if (!route) throw new Error(`No alert route matches ${event.source}/${event.severity}`);

  return {
    route,
    dedupKey: buildDedupKey(route, event),
    dedupWindowMinutes: route.dedupWindowMinutes ?? policy.defaults.dedupWindowMinutes,
    ackSlaMinutes: route.ackSlaMinutes ?? policy.defaults.ackSlaMinutes,
    held: route.respectQuietHours && isWithinQuietHours(policy, now),
  };
}
