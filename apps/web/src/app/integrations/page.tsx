'use client';

import React from 'react';
import Link from 'next/link';

type Integration = {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  status: 'available' | 'coming-soon';
  category: string;
};

const INTEGRATIONS: Integration[] = [
  {
    id: 'artifacts',
    title: 'Artifact Storage',
    description: 'Store and manage fuzzing artifacts, crash dumps, and test data with secure backend integration.',
    icon: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    href: '/integrations/artifacts',
    status: 'available',
    category: 'Storage'
  },
  {
    id: 'replay-e2e',
    title: 'Replay E2E Tests',
    description: 'Validate that persisted crash seeds replay deterministically and produce matching signatures end-to-end.',
    icon: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    href: '/integrations/replay-e2e',
    status: 'available',
    category: 'Testing'
  },
  {
    id: 'ui-harness',
    title: 'UI Flow Test Harness',
    description: 'Automated validation of end-to-end user journeys and interface stability across the platform.',
    icon: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    href: '/integrations/ui-harness',
    status: 'available',
    category: 'Testing'
  },
  {
    id: 'sanity-check',
    title: 'Sanity Check Pipeline',
    description: 'Automated validation of Soroban contracts, environment, dependencies, and configuration before fuzzing runs.',
    icon: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    href: '/integrations/sanity-check',
    status: 'available',
    category: 'Validation'
  },
  {
    id: 'api-errors',
    title: 'API Error Report',
    description: 'Visualize recurring API errors detected during fuzzing runs with counts, filtering, and affected run details.',
    icon: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    ),
    href: '/integrations/api-errors',
    status: 'available',
    category: 'Observability'
  },
  {
    id: 'issue-links',
    title: 'Run Issue Link Creator',
    description: 'Link fuzzing runs to external issue trackers like GitHub, Jira, and Linear for streamlined triage workflows.',
    icon: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
    href: '/integrations/issue-links',
    status: 'available',
    category: 'Triage'
  },
  {
    id: 'db-migrations',
    title: 'DB Migration Tests',
    description: 'End-to-end validation of bundle persistence schema migrations across CrashLab versions, including rollback and idempotency checks.',
    icon: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
    ),
    href: '/integrations/db-migrations',
    status: 'available',
    category: 'Database'
  },
  {
    id: 'ci',
    title: 'CI Integration',
    description: 'Integrate with CI/CD pipelines to run fuzzing tests automatically on code changes.',
    icon: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    href: '/integrations/ci-replay',
    status: 'available',
    category: 'DevOps'
  },
  {
    id: 'webhooks',
    title: 'Webhook Manager',
    description: 'Configure external endpoints to receive real-time notifications for fuzzing run lifecycle events.',
    icon: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    href: '/integrations/webhooks',
    status: 'available',
    category: 'Notifications'
  },
  {
    id: 'pagerduty',
    title: 'PagerDuty Alerts',
    description: 'Automatically page your on-call team when a fuzzing run encounters a critical failure. Uses PagerDuty Events API v2 with stable dedup-keys to prevent alert noise.',
    icon: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
    href: '/integrations/pagerduty',
    status: 'available',
    category: 'Alerting'
  },
  {
    id: 'prometheus',
    title: 'Prometheus Metrics',
    description: 'Export fuzzing run metrics and performance data to Prometheus for monitoring and alerting.',
    icon: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    href: '/integrations/prometheus',
    status: 'available',
    category: 'Monitoring'
  },
  {
    id: 'auth',
    title: 'External Authentication',
    description: 'Integrate with external authentication providers to manage user access and security.',
    icon: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
    href: '/integrations/auth',
    status: 'available',
    category: 'Security'
  }
];

export default function IntegrationsHub() {
  const availableIntegrations = INTEGRATIONS.filter(i => i.status === 'available');
  const comingSoonIntegrations = INTEGRATIONS.filter(i => i.status === 'coming-soon');

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className="relative border-b border-zinc-200/50 dark:border-zinc-800/50">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4">
            <p className="text-sm font-semibold uppercase tracking-widest text-purple-600 dark:text-purple-400">
              Available Integrations
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-5xl">
              Integrations Hub
            </h1>
            <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
              Connect SorobanCrashLab with your favorite tools and services. Streamline your fuzzing workflow with powerful integrations.
            </p>
          </div>
        </div>
      </div>

      {/* Available Integrations */}
      {availableIntegrations.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-8">
              Ready to Use
            </h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {availableIntegrations.map((integration) => (
                <Link
                  key={integration.id}
                  href={integration.href}
                  className="group relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-8 transition-all duration-300 hover:border-purple-300 dark:hover:border-purple-700 hover:shadow-lg dark:hover:shadow-purple-500/10 hover:-translate-y-1"
                >
                  {/* Gradient background on hover */}
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-50 to-transparent dark:from-purple-900/20 dark:to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  
                  <div className="relative z-10">
                    <div className="mb-4 inline-flex p-3 rounded-xl bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 group-hover:bg-purple-200 dark:group-hover:bg-purple-900/50 transition-colors">
                      {integration.icon}
                    </div>
                    
                    <div className="mb-3 flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                          {integration.title}
                        </h3>
                        <span className="inline-block mt-2 px-2 py-1 text-xs font-semibold uppercase tracking-widest rounded-full bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300">
                          Active
                        </span>
                      </div>
                    </div>
                    
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4">
                      {integration.description}
                    </p>
                    
                    <div className="flex items-center text-purple-600 dark:text-purple-400 font-semibold text-sm">
                      Explore <svg className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Coming Soon Integrations */}
      {comingSoonIntegrations.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 border-t border-zinc-200/50 dark:border-zinc-800/50">
          <div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-8">
              Coming Soon
            </h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {comingSoonIntegrations.map((integration) => (
                <div
                  key={integration.id}
                  className="relative overflow-hidden rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/30 p-8 opacity-75"
                >
                  <div className="absolute top-4 right-4">
                    <span className="inline-block px-3 py-1 text-xs font-bold uppercase tracking-widest rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                      Coming Soon
                    </span>
                  </div>
                  
                  <div>
                    <div className="mb-4 inline-flex p-3 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600">
                      {integration.icon}
                    </div>
                    
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">
                      {integration.title}
                    </h3>
                    
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4">
                      {integration.description}
                    </p>
                    
                    <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800">
                      <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-500 uppercase tracking-widest">
                        {integration.category}
                      </span>
                      <span className="text-xs text-zinc-400 dark:text-zinc-600">
                        Check back soon
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Footer CTA */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 border-t border-zinc-200/50 dark:border-zinc-800/50">
        <div className="rounded-2xl bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border border-purple-100 dark:border-purple-900/40 p-8 sm:p-12">
          <div className="flex flex-col gap-4">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
              Missing an integration?
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Constantly adding new integrations to help you get the most out of SorobanCrashLab. 
              If you have a feature request or integration idea, please open an issue on our GitHub repository.
            </p>
            <div className="pt-4">
              <a
                href="https://github.com/SorobanCrashLab/soroban-crashlab/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-6 py-3 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-colors shadow-lg shadow-purple-500/20"
              >
                Request Integration <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4m-4-6l6 6m0 0l-6 6m6-6H3" /></svg>
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
