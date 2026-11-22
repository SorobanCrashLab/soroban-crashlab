'use client';

import dynamic from 'next/dynamic';
import BreadcrumbNav from '@/components/BreadcrumbNav';
import { LoadingSpinner } from '../../../../components/LoadingSkeleton';

const AlertingPresetsPage = dynamic(
  () => import('../../../../features/alerting/create-alerting-presets-page'),
  { loading: () => <LoadingSpinner /> },
);

export default function AlertingPresetsRoutePage() {
  return (
    <div className="px-6 md:px-8 max-w-5xl mx-auto w-full py-14">
      <BreadcrumbNav
        segments={[
          { label: 'Settings', href: '/settings' },
          { label: 'Alerting', href: '/settings/alerting' },
          { label: 'Presets' },
        ]}
      />
      <AlertingPresetsPage />
    </div>
  );
}
