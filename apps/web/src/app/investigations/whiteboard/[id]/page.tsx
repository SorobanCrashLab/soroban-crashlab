import React from 'react';
import { TriageWhiteboard } from '@/features/whiteboard/TriageWhiteboard';

export default async function WhiteboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TriageWhiteboard boardId={id} />;
}
