import IntegratePagerdutyAlertIntegration from '../../integrate-pagerduty-alert-integration';
import IntegrationPageSkeleton from '../IntegrationPageSkeleton';
import { Suspense } from 'react';

export const metadata = {
  title: 'PagerDuty Alerts – Integrations | SorobanCrashLab',
  description:
    'Configure PagerDuty alerting for critical fuzzing failures. Page your on-call team automatically when crashes exceed your alert threshold.',
};

export default function PagerDutyIntegrationPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <Suspense fallback={<IntegrationPageSkeleton />}>
        <IntegratePagerdutyAlertIntegration />
      </Suspense>
    </div>
  );
}
