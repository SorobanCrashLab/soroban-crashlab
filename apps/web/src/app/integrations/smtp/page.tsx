'use client';

import dynamic from 'next/dynamic';
import IntegrationPageSkeleton from '../IntegrationPageSkeleton';

const IntegrateSmtpEmailIntegration = dynamic(
  () => import('../../integrate-smtp-email-integration'),
  { loading: () => <IntegrationPageSkeleton /> },
);

export default function SmtpIntegrationPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <IntegrateSmtpEmailIntegration />
    </div>
  );
}
