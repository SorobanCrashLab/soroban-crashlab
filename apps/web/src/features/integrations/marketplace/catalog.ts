export type IntegrationCategory =
  | 'CI'
  | 'Alerts'
  | 'Observability'
  | 'Issue tracking'
  | 'Webhooks'
  | 'Storage'
  | 'Security';

export type IntegrationCatalogEntry = {
  id: string;
  name: string;
  description: string;
  category: IntegrationCategory;
  href: string;
  capabilities: string[];
  prerequisites: string[];
  setupTime: string;
  documentationUrl: string;
  activityHref?: string;
};

export const INTEGRATION_CATALOG: IntegrationCatalogEntry[] = [
  {
    id: 'github-actions',
    name: 'GitHub Actions',
    description: 'Review recent workflow failures and rerun failed jobs from CrashLab.',
    category: 'CI',
    href: '/integrations/github-actions',
    capabilities: ['Workflow monitoring', 'Retry failed jobs'],
    prerequisites: ['A GitHub repository', 'GitHub API credentials on the server'],
    setupTime: 'About 5 minutes',
    documentationUrl: 'https://docs.github.com/actions',
  },
  {
    id: 'pagerduty',
    name: 'PagerDuty',
    description: 'Send critical run failures to your on-call team and review incidents.',
    category: 'Alerts',
    href: '/integrations/pagerduty',
    capabilities: ['Incident alerts', 'Deduplicated events', 'Connection test'],
    prerequisites: ['A PagerDuty Events API v2 integration key'],
    setupTime: 'About 5 minutes',
    documentationUrl: 'https://developer.pagerduty.com/docs/events-api-v2/overview/',
  },
  {
    id: 'smtp',
    name: 'SMTP Email',
    description: 'Deliver run and incident notifications through an SMTP server.',
    category: 'Alerts',
    href: '/integrations/smtp',
    capabilities: ['Email notifications', 'Connection test', 'Delivery history'],
    prerequisites: ['SMTP host, port, and credentials'],
    setupTime: 'About 5 minutes',
    documentationUrl: 'https://nodemailer.com/smtp/',
  },
  {
    id: 'prometheus',
    name: 'Prometheus',
    description: 'Expose CrashLab metrics for Prometheus scraping and alerting.',
    category: 'Observability',
    href: '/integrations/prometheus',
    capabilities: ['Metrics export', 'Health endpoint'],
    prerequisites: ['A Prometheus server with access to the CrashLab endpoint'],
    setupTime: 'About 10 minutes',
    documentationUrl: 'https://prometheus.io/docs/introduction/overview/',
  },
  {
    id: 'grafana',
    name: 'Grafana',
    description: 'Annotate dashboards with run lifecycle events and failures.',
    category: 'Observability',
    href: '/integrations/grafana',
    capabilities: ['Dashboard annotations', 'Connection test'],
    prerequisites: ['Grafana URL and an API token'],
    setupTime: 'About 5 minutes',
    documentationUrl: 'https://grafana.com/docs/grafana/latest/dashboards/annotations/',
  },
  {
    id: 'sentry',
    name: 'Sentry',
    description: 'Connect crash reporting workflows to Sentry projects.',
    category: 'Observability',
    href: '/integrations/sentry',
    capabilities: ['Crash reporting', 'Connection test'],
    prerequisites: ['A Sentry project and authentication token'],
    setupTime: 'About 5 minutes',
    documentationUrl: 'https://docs.sentry.io/',
  },
  {
    id: 'webhooks',
    name: 'Webhooks',
    description: 'Deliver run lifecycle events to external services and inspect retries.',
    category: 'Webhooks',
    href: '/integrations/webhooks',
    capabilities: ['Event delivery', 'Retry dashboard', 'Dead-letter queue'],
    prerequisites: ['An HTTPS endpoint that accepts CrashLab events'],
    setupTime: 'About 5 minutes',
    documentationUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview',
    activityHref: '/integrations/webhooks/retry-dashboard',
  },
  {
    id: 'issue-links',
    name: 'Issue trackers',
    description: 'Link fuzzing runs to external issues for triage and follow-up.',
    category: 'Issue tracking',
    href: '/integrations/issue-links',
    capabilities: ['Run-to-issue links', 'Triage context'],
    prerequisites: ['A supported issue tracker account'],
    setupTime: 'About 5 minutes',
    documentationUrl: 'https://docs.github.com/issues',
  },
  {
    id: 'artifacts',
    name: 'Artifact storage',
    description: 'Configure storage for crash dumps, replay seeds, and test artifacts.',
    category: 'Storage',
    href: '/integrations/artifacts',
    capabilities: ['Crash artifact storage', 'Replay seed persistence'],
    prerequisites: ['A configured storage backend'],
    setupTime: 'About 10 minutes',
    documentationUrl: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html',
  },
  {
    id: 'auth',
    name: 'External authentication',
    description: 'Connect an external identity provider to manage user access.',
    category: 'Security',
    href: '/integrations/auth',
    capabilities: ['External identity provider', 'Access management'],
    prerequisites: ['An identity provider and administrator access'],
    setupTime: 'About 10 minutes',
    documentationUrl: 'https://openid.net/developers/how-connect-works/',
  },
];

export const INTEGRATION_CATEGORIES: IntegrationCategory[] = [
  'CI',
  'Alerts',
  'Observability',
  'Issue tracking',
  'Webhooks',
  'Storage',
  'Security',
];

export function filterIntegrations(
  entries: IntegrationCatalogEntry[],
  query: string,
  category: IntegrationCategory | 'All',
): IntegrationCatalogEntry[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return entries.filter((entry) => {
    const matchesCategory = category === 'All' || entry.category === category;
    const searchableText = [
      entry.name,
      entry.description,
      entry.category,
      ...entry.capabilities,
      ...entry.prerequisites,
    ].join(' ').toLocaleLowerCase();

    return matchesCategory && (!normalizedQuery || searchableText.includes(normalizedQuery));
  });
}
