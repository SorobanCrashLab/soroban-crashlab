import Link from 'next/link';
import StateTimelineInspector from '@/features/state-inspector/StateTimelineInspector';

export const dynamic = 'force-dynamic';

export default async function RunStatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-10 md:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Run investigation</p>
          <h1 className="mt-1 text-3xl font-bold text-zinc-950 dark:text-zinc-50">State &amp; Ledger Timeline</h1>
          <p className="mt-1 font-mono text-sm text-zinc-500">{id}</p>
        </div>
        <Link href={`/runs/${encodeURIComponent(id)}`} className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
          Back to run
        </Link>
      </div>
      <StateTimelineInspector runId={id} />
    </main>
  );
}
