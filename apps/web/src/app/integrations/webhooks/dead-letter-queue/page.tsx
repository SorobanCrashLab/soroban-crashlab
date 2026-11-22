'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import IntegrationPageSkeleton from '../../IntegrationPageSkeleton';

const DeadLetterQueueComponent = dynamic(() => import('./DeadLetterQueueComponent'), {
  loading: () => <IntegrationPageSkeleton />,
});

export default function DeadLetterQueuePage() {
  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <DeadLetterQueueComponent />
    </div>
  );
}
