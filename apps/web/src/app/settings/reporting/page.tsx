'use client';

import dynamic from 'next/dynamic';
import { LoadingSpinner } from '../../../components/LoadingSkeleton';

const CreateReportingTemplatesPage60 = dynamic(
  () => import('../../../features/analytics/create-reporting-templates-page-60'),
  { loading: () => <LoadingSpinner /> },
);

export default function ReportingSettingsPage() {
  return (
    <div className="px-6 md:px-8 max-w-5xl mx-auto w-full py-14">
      <CreateReportingTemplatesPage60 />
    </div>
  );
}
