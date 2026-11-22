/**
 * Server wiring for the alert dispatcher (#1892): policy file, real channel
 * transports, and the process-wide dispatcher the API routes share.
 *
 * Credentials are maintainer setup and come only from the environment (see
 * docs/ENV.md and docs/ops/oncall.md). A channel without credentials logs and
 * skips rather than failing the dispatch, so local dev works with none set.
 */

import fs from 'node:fs';
import path from 'node:path';
import { PAGERDUTY_FETCH_TIMEOUT_MS } from '../timeouts';
import { sendEmail } from '../integrations/smtp-email';
import { getStoredSmtpConfig } from '../integrations/smtp-store';
import { AlertDispatcher, type AlertNotification, type AlertTransport } from './alert-dispatcher';
import { parseAlertPolicy, type AlertPolicy } from './alert-policy';

const PD_EVENTS_API_URL = 'https://events.pagerduty.com/v2/enqueue';

/** `ALERT_POLICY_PATH` overrides; otherwise the repo's `ops/alert-policies.yml`. */
export function loadAlertPolicy(policyPath = process.env.ALERT_POLICY_PATH): AlertPolicy {
  const resolved = policyPath?.trim() || path.resolve(process.cwd(), '../../ops/alert-policies.yml');
  return parseAlertPolicy(fs.readFileSync(resolved, 'utf8'));
}

function describe({ action, incident }: AlertNotification): string {
  const verb = { trigger: 'TRIGGERED', escalate: 'ESCALATED', acknowledge: 'ACKNOWLEDGED', resolve: 'RESOLVED' }[action];
  const suffix = incident.resolutionNote ? ` — ${incident.resolutionNote}` : '';
  return `[${verb}] ${incident.severity.toUpperCase()} ${incident.summary} (${incident.dedupKey}, x${incident.occurrences})${suffix}`;
}

async function postJson(url: string, body: unknown): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(PAGERDUTY_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
}

export interface AlertTransportEnv {
  PAGERDUTY_INTEGRATION_KEY?: string;
  ALERT_SLACK_WEBHOOK_URL?: string;
  ALERT_EMAIL_TO?: string;
}

export function createEnvAlertTransport(
  env: AlertTransportEnv = {
    PAGERDUTY_INTEGRATION_KEY: process.env.PAGERDUTY_INTEGRATION_KEY,
    ALERT_SLACK_WEBHOOK_URL: process.env.ALERT_SLACK_WEBHOOK_URL,
    ALERT_EMAIL_TO: process.env.ALERT_EMAIL_TO,
  },
): AlertTransport {
  return {
    async send(notification) {
      const { channel, action, incident } = notification;

      if (channel === 'pagerduty') {
        const routingKey = env.PAGERDUTY_INTEGRATION_KEY?.trim();
        if (!routingKey) return console.warn('[alerts] PAGERDUTY_INTEGRATION_KEY unset; skipping');
        const eventAction = action === 'escalate' ? 'trigger' : action;
        await postJson(PD_EVENTS_API_URL, {
          routing_key: routingKey,
          event_action: eventAction,
          dedup_key: incident.dedupKey,
          ...(eventAction === 'trigger' && {
            payload: {
              summary: incident.summary,
              severity: incident.severity,
              source: incident.source,
              custom_details: { route: incident.routeId, occurrences: incident.occurrences },
            },
          }),
        });
        return;
      }

      if (channel === 'slack') {
        const webhookUrl = env.ALERT_SLACK_WEBHOOK_URL?.trim();
        if (!webhookUrl) return console.warn('[alerts] ALERT_SLACK_WEBHOOK_URL unset; skipping');
        await postJson(webhookUrl, { text: describe(notification) });
        return;
      }

      const to = env.ALERT_EMAIL_TO?.trim();
      const smtp = getStoredSmtpConfig();
      if (!to || !smtp) return console.warn('[alerts] ALERT_EMAIL_TO or SMTP config unset; skipping');
      const result = await sendEmail(smtp, { to, subject: describe(notification), text: describe(notification) });
      if (!result.success) throw new Error(result.error);
    },
  };
}

const globalForAlerts = globalThis as unknown as { crashlabAlertDispatcher?: AlertDispatcher };

export function getAlertDispatcher(): AlertDispatcher {
  globalForAlerts.crashlabAlertDispatcher ??= new AlertDispatcher({
    policy: loadAlertPolicy(),
    transport: createEnvAlertTransport(),
  });
  return globalForAlerts.crashlabAlertDispatcher;
}
