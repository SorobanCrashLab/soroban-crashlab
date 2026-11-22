'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import IntegrationPageSkeleton from '../IntegrationPageSkeleton';
import WebhookSigningSecretsSection from '../../../features/integrations/webhook-signing-secrets-section';

import Link from 'next/link';

const IntegrateWebhookManagerForRunEvents = dynamic(() => import('../../../features/integrations/integrate-webhook-manager-for-run-events'), {
  loading: () => <IntegrationPageSkeleton />,
});

export default function WebhooksPage() {
  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/50 p-4 rounded-2xl">
        <div>
          <h2 className="text-sm font-bold text-purple-900 dark:text-purple-200">Webhook Delivery & Retry Dashboard</h2>
          <p className="text-xs text-purple-700 dark:text-purple-300">View real-time delivery logs, inspect failure payloads, and trigger manual retries.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/integrations/webhooks/retry-dashboard"
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-xs transition"
          >
            Open Retry Dashboard →
          </Link>
          <Link
            href="/integrations/webhooks/dead-letter-queue"
            className="px-4 py-2 border border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-200 font-bold text-xs rounded-xl transition hover:bg-purple-100 dark:hover:bg-purple-900/40"
          >
            Dead-letter Queue →
          </Link>
        </div>
      </div>
      <IntegrateWebhookManagerForRunEvents />
      <WebhookSigningSecretsSection />
    </div>
  );
}
