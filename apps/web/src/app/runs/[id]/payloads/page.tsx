import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildMockRuns } from '@/fixtures/runs';
import InspectorEntry from '@/features/xdr-inspector/InspectorEntry';
export const dynamic = 'force-dynamic';
export default async function PayloadsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ artifact?: string; context?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (!buildMockRuns().some((run) => run.id === id)) notFound();
  const context = `Run ${id}${query.artifact ? ` | artifact ${query.artifact.slice(0, 256)}` : ''}${query.context ? ` | ${query.context.slice(0, 64)}` : ''}`;
  return (
    <main className="container-full page-padding">
      <Link href={`/runs/${encodeURIComponent(id)}`} className="mb-5 inline-block underline">
        Back to run
      </Link>
      <InspectorEntry context={context} />
    </main>
  );
}
