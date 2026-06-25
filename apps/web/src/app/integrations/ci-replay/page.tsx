'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import IntegrationPageSkeleton from '../IntegrationPageSkeleton';

const CIIntegrationForRunReplayTests = dynamic(() => import('../../integrate-ci-integration-for-run-replay-tests'), {
  loading: () => <IntegrationPageSkeleton />,
});

export default function CIReplayIntegrationPage() {
  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <CIIntegrationForRunReplayTests />
    </div>
  );
}