'use client';

import dynamic from 'next/dynamic';
import IntegrationPageSkeleton from '../IntegrationPageSkeleton';

const SanityCheckPipelinePage = dynamic(() => import('../../create-sanity-check-pipeline-page-page'), {
  loading: () => <IntegrationPageSkeleton />,
});

export default function SanityCheckIntegrationPage() {
  return <SanityCheckPipelinePage />;
}
