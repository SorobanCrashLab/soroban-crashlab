import { notFound } from 'next/navigation';
import { labById, type Lab } from '@/lib/onboarding-labs';
import { LabDetailView } from '@/components/labs/LabDetailView';

export default async function LabPage({ params }: { params: Promise<{ labId: string }> }) {
  const { labId } = await params;
  const lab: Lab | undefined = labById(labId);
  if (!lab) notFound();
  return <LabDetailView lab={lab} />;
}
