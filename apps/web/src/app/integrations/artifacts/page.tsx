'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import IntegrationPageSkeleton from '../IntegrationPageSkeleton';

const ArtifactStorageIntegration = dynamic(
  () => import('../../integrate-storage-backend-integration-for-artifacts'),
  {
    ssr: false,
    loading: () => <IntegrationPageSkeleton />,
  }
);

export default function ArtifactStorageIntegrationPage() {
  return <ArtifactStorageIntegration />;
}
