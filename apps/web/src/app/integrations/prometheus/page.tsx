'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import IntegrationPageSkeleton from '../IntegrationPageSkeleton';

const MetricsExportToPrometheus = dynamic(() => import('../../integrate-metrics-export-to-prometheus'), {
  loading: () => <IntegrationPageSkeleton />,
});

export default function PrometheusPage() {
  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <MetricsExportToPrometheus />
    </div>
  );
}
