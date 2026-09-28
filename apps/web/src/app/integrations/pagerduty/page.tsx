'use client';

import dynamic from 'next/dynamic';
import IntegrationPageSkeleton from '../IntegrationPageSkeleton';

const IntegratePagerdutyAlertIntegration = dynamic(
  () => import('../../../features/integrations/integrate-pagerduty-alert-integration'),
  { loading: () => <IntegrationPageSkeleton /> },
);

export default function PagerDutyIntegrationPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <IntegratePagerdutyAlertIntegration />
    </div>
  );
}
