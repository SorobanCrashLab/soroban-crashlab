import React from 'react';
import { ReleaseCommandCenter } from '@/features/releases/ReleaseCommandCenter';

export default async function ReleaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReleaseCommandCenter releaseId={id} />;
}
