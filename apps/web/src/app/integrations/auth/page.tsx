'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import IntegrationPageSkeleton from '../IntegrationPageSkeleton';

const ExternalAuthenticationIntegration = dynamic(() => import('../../integrate-external-authentication-integration'), {
  loading: () => <IntegrationPageSkeleton />,
});

export default function ExternalAuthenticationIntegrationPage() {
  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <ExternalAuthenticationIntegration />
    </div>
  );
}
