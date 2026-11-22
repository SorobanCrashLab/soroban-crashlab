'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const ApiConfigForm = dynamic(
  () => import('../../../components/ApiConfigForm'),
  { loading: () => <p>Loading...</p> },
);

const ApiTokenManager = dynamic(
  () => import('./ApiTokenManager'),
  { loading: () => <p>Loading tokens...</p> },
);

export default function ApiSettingsPage() {
  return (
    <div className="px-6 md:px-8 max-w-5xl mx-auto w-full py-14 space-y-6">
      <ApiConfigForm />
      <ApiTokenManager />
    </div>
  );
}
