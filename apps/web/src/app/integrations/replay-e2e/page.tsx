'use client';

import dynamic from 'next/dynamic';
import IntegrationPageSkeleton from '../IntegrationPageSkeleton';

const ReplayEndToEndIntegrationTest = dynamic(() => import('../../integrate-replay-end-to-end-integration-test'), {
  loading: () => <IntegrationPageSkeleton />,
});

export default function ReplayE2EIntegrationPage() {
  return <ReplayEndToEndIntegrationTest />;
}
