'use client';

/** Compact live campaign dashboard view (issue #2206). Pure presentation:
 * data is supplied by the SSE stream + aggregator + alert engine. */

import type { AlertResult, AlertState } from './metrics/AlertEngine';
import type { MetricSummary } from './metrics/MetricAggregator';

export interface CampaignSnapshot {
  id: string;
  name: string;
  metrics: Record<string, MetricSummary>;
  alerts: AlertResult[];
}

/** Worst alert state across a campaign's alerts. */
export function campaignStatus(alerts: AlertResult[]): AlertState {
  if (alerts.some((a) => a.state === 'critical')) return 'critical';
  if (alerts.some((a) => a.state === 'warning')) return 'warning';
  return 'healthy';
}

export default function LiveCampaignDashboard({ campaigns }: { campaigns: CampaignSnapshot[] }) {
  return (
    <section data-testid="live-campaign-dashboard" aria-label="Live campaigns">
      {campaigns.map((campaign) => (
        <article key={campaign.id} data-status={campaignStatus(campaign.alerts)}>
          <h3>{campaign.name}</h3>
          <span>{campaignStatus(campaign.alerts)}</span>
          <ul>
            {Object.entries(campaign.metrics).map(([name, metric]) => (
              <li key={name}>
                {name}: {metric.current.toFixed(1)}
              </li>
            ))}
          </ul>
          <ul aria-label="alerts">
            {campaign.alerts.map((alert) => (
              <li key={alert.ruleId}>
                {alert.ruleId}: {alert.state}
              </li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  );
}
