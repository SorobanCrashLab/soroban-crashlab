import { notFound } from 'next/navigation';
import { buildMockRuns } from '../../../mockRuns';
import AddRunReplayHistoryWithTimestamps from '../../../../features/runs/add-run-replay-history-with-timestamps';
import BreadcrumbNav from '@/components/BreadcrumbNav';

export const dynamic = 'force-dynamic';

interface ReplayHistoryPageProps {
  params: Promise<{ id: string }>;
}

export default async function ReplayHistoryPage({ params }: ReplayHistoryPageProps) {
  const { id } = await params;
  const run = buildMockRuns().find((r) => r.id === id);

  if (!run) {
    notFound();
  }

  return (
    <div className="container-full page-padding fade-in">
      <BreadcrumbNav
        segments={[
          { label: 'Runs', href: '/runs' },
          { label: id, href: `/runs/${id}` },
          { label: 'Replay History' },
        ]}
      />

      <div className="mb-6">
        <h1 className="heading-page">Replay History</h1>
        <p className="text-meta mt-1">
          All replays triggered from{' '}
          <span className="code-text">{id}</span>
          {' '}— timestamps, durations, and status changes.
        </p>
      </div>

      <AddRunReplayHistoryWithTimestamps sourceRunId={id} title="Replay History" />
    </div>
  );
}
