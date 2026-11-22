'use client';

import dynamic from 'next/dynamic';
import IntegrationPageSkeleton from '../IntegrationPageSkeleton';

const GithubActionsContent = dynamic(() => import('./GithubActionsContent'), {
  loading: () => <IntegrationPageSkeleton />,
});

export default function GithubActionsIntegrationPage() {
  return <GithubActionsContent />;
}
