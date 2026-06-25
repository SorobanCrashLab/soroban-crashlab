'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import IntegrationPageSkeleton from '../IntegrationPageSkeleton';

const DatabaseMigrationIntegrationTests = dynamic(() => import('../../integrate-database-migration-integration-tests'), {
  loading: () => <IntegrationPageSkeleton />,
});

export default function DbMigrationsIntegrationPage() {
  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <DatabaseMigrationIntegrationTests />
    </div>
  );
}
