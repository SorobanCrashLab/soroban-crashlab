import InspectorEntry from '@/features/xdr-inspector/InspectorEntry';
export const dynamic = 'force-dynamic';
export default async function InspectorPage({
  searchParams,
}: {
  searchParams: Promise<{ artifact?: string; context?: string }>;
}) {
  const query = await searchParams;
  return (
    <main className="container-full page-padding">
      <InspectorEntry
        context={
          query.artifact ? `Artifact ${query.artifact.slice(0, 256)}` : query.context?.slice(0, 256)
        }
      />
    </main>
  );
}
