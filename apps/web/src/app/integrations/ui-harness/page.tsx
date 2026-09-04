'use client';

import dynamic from 'next/dynamic';
import IntegrationPageSkeleton from '../IntegrationPageSkeleton';

const IntegrationTestHarnessForUIFlows = dynamic(() => import('../../integrate-integration-test-harness-for-ui-flows'), {
  loading: () => <IntegrationPageSkeleton />,
});

export default function UIHarnessPage() {
  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <IntegrationTestHarnessForUIFlows />
    </div>
  );
}