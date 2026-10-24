'use client';

import dynamic from 'next/dynamic';
import { FeeInsightSkeleton } from './FeeInsightSkeleton';

/**
 * W5-H11: the fee panel (histograms, SVG trend and table) is route-split and
 * only fetched after the campaign shell paints. Charts never enter the shared
 * bundle for routes that do not show them.
 */
const ResourceFeeInsightPanel = dynamic(
  () =>
    import('./ResourceFeeInsightPanel').then((module) => ({
      default: module.ResourceFeeInsightPanel,
    })),
  {
    ssr: false,
    loading: () => <FeeInsightSkeleton />,
  },
);

export function CampaignFeeInsightLoader({ campaignId }: { campaignId: string }) {
  return <ResourceFeeInsightPanel campaignId={campaignId} />;
}
