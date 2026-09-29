'use client';

import dynamic from 'next/dynamic';
import IntegrationPageSkeleton from '../IntegrationPageSkeleton';

const IntegrateGrafanaDashboardAnnotationApi = dynamic(
  () => import('../../../features/integrations/integrate-grafana-dashboard-annotation-api'),
  { loading: () => <IntegrationPageSkeleton /> },
);

export default function GrafanaIntegrationPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <IntegrateGrafanaDashboardAnnotationApi />
    </div>
  );
}
