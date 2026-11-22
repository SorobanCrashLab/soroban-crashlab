'use client';

import dynamic from 'next/dynamic';
import IntegrationPageSkeleton from '../IntegrationPageSkeleton';

const RunIssueLinkPage = dynamic(() => import('../../../features/runs/create-run-issue-link-page-page'), {
  loading: () => <IntegrationPageSkeleton />,
});

export default function IssueLinksIntegrationPage() {
  return <RunIssueLinkPage runs={[]} onLinkIssue={() => {}} />;
}
