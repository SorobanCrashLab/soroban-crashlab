import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildMockRuns } from '../../../mockRuns';
import { buildMockSequenceSteps } from '../../../sequence-diagram-utils';
import ContractSequenceDiagramView from '../../../ContractSequenceDiagramView';

export const dynamic = 'force-dynamic';

interface SequencePageProps {
  params: Promise<{ id: string }>;
}

export default async function RunSequencePage({ params }: SequencePageProps) {
  const { id } = await params;
  const run = buildMockRuns().find((entry) => entry.id === id);

  if (!run) {
    notFound();
  }

  const steps = buildMockSequenceSteps(run.id);

  return (
    <div className="px-6 md:px-8 max-w-5xl mx-auto w-full py-14">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">Sequence diagram</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 font-mono">Run {run.id}</p>
        </div>
        <Link
          href={`/runs/${run.id}`}
          className="inline-flex items-center justify-center h-10 px-4 rounded-full border border-zinc-300 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900 transition"
        >
          Back to run
        </Link>
      </div>
      <ContractSequenceDiagramView steps={steps} runId={run.id} />
    </div>
  );
}
