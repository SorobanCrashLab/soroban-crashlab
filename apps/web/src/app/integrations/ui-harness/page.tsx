import dynamic from 'next/dynamic';
import IntegrationPageSkeleton from '../IntegrationPageSkeleton';

const IntegrationTestHarnessForUIFlows = dynamic(() => import('../../integrate-integration-test-harness-for-ui-flows'), {
  loading: () => <IntegrationPageSkeleton />,
});

export const metadata = {
  title: 'UI Flow Test Harness | SorobanCrashLab',
  description: 'Automated validation of end-to-end user journeys and interface stability.',
};

export default function UIHarnessPage() {
  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <IntegrationTestHarnessForUIFlows />
    </div>
  );
}