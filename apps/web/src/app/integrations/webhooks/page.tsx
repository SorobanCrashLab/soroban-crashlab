'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import IntegrationPageSkeleton from '../IntegrationPageSkeleton';

const IntegrateWebhookManagerForRunEvents = dynamic(() => import('../../integrate-webhook-manager-for-run-events'), {
  loading: () => <IntegrationPageSkeleton />,
});

export default function WebhooksPage() {
  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <IntegrateWebhookManagerForRunEvents />
    </div>
  );
}
