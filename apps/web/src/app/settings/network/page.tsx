'use client';

import dynamic from 'next/dynamic';
import { LoadingSpinner } from '../../../components/LoadingSkeleton';

const NetworkConfigForm = dynamic(
  () => import('../../../components/NetworkConfigForm'),
  { loading: () => <LoadingSpinner /> },
);

export default function NetworkSettingsPage() {
  return (
    <div className="px-6 md:px-8 max-w-5xl mx-auto w-full py-14">
      <NetworkConfigForm />
    </div>
  );
}
