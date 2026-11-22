'use client';

import dynamic from 'next/dynamic';
import { LoadingSpinner } from '../../components/LoadingSkeleton';

const CreateSavedFilterPresetsPage = dynamic(
  () => import('../../features/misc/create-saved-filter-presets-page'),
  { loading: () => <LoadingSpinner /> },
);

export default function FilterPresetsRoutePage() {
  return (
    <div className="px-6 md:px-8 max-w-5xl mx-auto w-full py-14">
      <CreateSavedFilterPresetsPage />
    </div>
  );
}
