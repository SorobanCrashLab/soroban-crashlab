'use client';

import dynamic from 'next/dynamic';
import IntegrationPageSkeleton from '../IntegrationPageSkeleton';

const IntegrateSentryIntegrationForCrashReporting = dynamic(
  () => import('../../../features/integrations/integrate-sentry-integration-for-crash-reporting'),
  { loading: () => <IntegrationPageSkeleton /> },
);

export default function SentryIntegrationPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <IntegrateSentryIntegrationForCrashReporting />
    </div>
  );
}
