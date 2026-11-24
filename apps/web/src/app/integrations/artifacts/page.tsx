'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import IntegrationPageSkeleton from '../IntegrationPageSkeleton';

// Storage & provenance manager (#2342): multi-backend explorer, integrity,
// lineage, retention and holds. Loaded on demand like the upload widget.
const ArtifactStorageManager = dynamic(
  () => import('../../../features/artifacts/storage-manager/ArtifactStorageManager'),
  {
    loading: () => <IntegrationPageSkeleton />,
  }
);

const ArtifactStorageIntegration = dynamic(
  () => import('../../../features/integrations/integrate-storage-backend-integration-for-artifacts'),
  {
    loading: () => <IntegrationPageSkeleton />,
  }
);

export default function ArtifactStorageIntegrationPage() {
  return (
    <>
      <ArtifactStorageManager />
      <section aria-label="Upload artifacts">
        <ArtifactStorageIntegration />
      </section>
    </>
  );
}
