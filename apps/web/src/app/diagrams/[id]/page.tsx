import React from 'react';
import { DiagramStudio } from '@/features/diagrams/DiagramStudio';

export default async function DiagramPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DiagramStudio diagramId={id} />;
}
