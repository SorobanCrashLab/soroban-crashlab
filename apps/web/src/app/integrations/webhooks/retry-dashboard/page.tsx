'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import IntegrationPageSkeleton from '../../IntegrationPageSkeleton';

const WebhookRetryDashboardComponent = dynamic(
  () => import('./WebhookRetryDashboardComponent'),
  {
    loading: () => <IntegrationPageSkeleton />,
  }
);

export default function WebhookRetryDashboardPage() {
  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <WebhookRetryDashboardComponent />
    </div>
  );
}
