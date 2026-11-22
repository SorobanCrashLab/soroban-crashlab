'use client';

import dynamic from 'next/dynamic';
import IntegrationPageSkeleton from '../IntegrationPageSkeleton';

const ApiErrorReportPage = dynamic(() => import('../../api-error-report-page'), {
  loading: () => <IntegrationPageSkeleton />,
});

export default function ApiErrorsIntegrationPage() {
  return <ApiErrorReportPage />;
}
