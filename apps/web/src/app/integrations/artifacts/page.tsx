'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import IntegrationPageSkeleton from '../IntegrationPageSkeleton';

const ArtifactStorageIntegration = dynamic(
  () => import('../../../features/integrations/integrate-storage-backend-integration-for-artifacts'),
  {
    loading: () => <IntegrationPageSkeleton />,
  }
);

export default function ArtifactStorageIntegrationPage() {
  return <ArtifactStorageIntegration />;
}
