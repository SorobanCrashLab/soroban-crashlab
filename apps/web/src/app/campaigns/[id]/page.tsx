import Link from 'next/link';
import BreadcrumbNav from '@/components/BreadcrumbNav';
import { CampaignFeeInsightLoader } from './CampaignFeeInsightLoader';

export const dynamic = 'force-dynamic';

interface CampaignDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function CampaignDetailPage({ params }: CampaignDetailPageProps) {
  const { id } = await params;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-14 md:px-8">
      <BreadcrumbNav
        segments={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Campaign', href: '/runs' },
          { label: id },
        ]}
      />

      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            Campaign {id}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Resource metering risk: per-campaign fee distributions, warn/flag thresholds,
            expensive fixtures and spend over time. Runs recorded before the W5-A12 fee
            envelope are shown as legacy coverage.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/runs?campaign=${encodeURIComponent(id)}`} className="btn-outline text-sm">
            Browse runs
          </Link>
          <Link href="/start" className="btn-primary text-sm">
            Start a campaign
          </Link>
        </div>
      </header>

      <CampaignFeeInsightLoader campaignId={id} />
    </div>
  );
}
