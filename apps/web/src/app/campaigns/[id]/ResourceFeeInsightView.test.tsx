import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FuzzingRun } from '../../types';
import { aggregateCampaignFeeInsight } from '../../resource-fee-insight-utils';
import { ResourceFeeInsightView } from './ResourceFeeInsightView';
import { RunFeeSummaryChip } from '../../runs/[id]/RunFeeSummaryChip';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string | { pathname?: string };
    children: React.ReactNode;
  }) => (
    <a href={typeof href === 'string' ? href : (href.pathname ?? '')} {...props}>
      {children}
    </a>
  ),
}));

function makeRun(overrides: Partial<FuzzingRun> = {}): FuzzingRun {
  return {
    id: 'run-1',
    campaignId: 'campaign-fixture',
    status: 'completed',
    area: 'budget',
    severity: 'low',
    duration: 1_000,
    seedCount: 10,
    crashDetail: null,
    cpuInstructions: 500_000,
    memoryBytes: 2_000_000,
    minResourceFee: 3_500,
    feeWarnThreshold: 2_500,
    resourceUsage: { cpuInstructions: 500_000, memoryBytes: 2_000_000, minBuiltinEntries: 3 },
    fee: { minResourceFee: 3_500, inclusionFee: 100, feeWarnThreshold: 2_500 },
    startedAt: '2026-03-01T08:00:00.000Z',
    ...overrides,
  };
}

describe('ResourceFeeInsightView', () => {
  it('renders the aggregation-loading skeleton', () => {
    const html = renderToStaticMarkup(
      <ResourceFeeInsightView campaignId="campaign-fixture" dataState="loading" />,
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Resource Fee Insight loading');
  });

  it('renders an error state with a retry action', () => {
    const html = renderToStaticMarkup(
      <ResourceFeeInsightView
        campaignId="campaign-fixture"
        dataState="error"
        errorMessage="Fee aggregation failed"
        onRetry={() => {}}
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('Fee aggregation failed');
    expect(html).toContain('Retry resource insight');
  });

  it('renders empty campaign guidance', () => {
    const data = aggregateCampaignFeeInsight('campaign-empty', []);
    const html = renderToStaticMarkup(
      <ResourceFeeInsightView campaignId="campaign-empty" data={data} />,
    );
    expect(html).toContain('No runs in this campaign yet');
    expect(html).toContain('Start a campaign');
  });

  it('explains fee-data-absent runs instead of rendering zeros', () => {
    const absent = {
      ...makeRun({ id: 'old-run' }),
      campaignId: 'campaign-old',
      cpuInstructions: undefined,
      memoryBytes: undefined,
      minResourceFee: undefined,
      feeWarnThreshold: undefined,
      resourceUsage: undefined,
      fee: undefined,
    } as unknown as FuzzingRun;
    const data = aggregateCampaignFeeInsight('campaign-old', [absent]);
    const html = renderToStaticMarkup(
      <ResourceFeeInsightView campaignId="campaign-old" data={data} />,
    );
    expect(html).toContain('No fee tracking data for this campaign');
    expect(html).toContain('W5-A12');
  });

  it('renders histograms, threshold markers, trend and expensive fixture links', () => {
    const runs = [
      makeRun({ id: 'run-a', minResourceFee: 2_900 }),
      makeRun({ id: 'run-b', minResourceFee: 4_500 }),
      makeRun({
        id: 'run-c',
        status: 'failed',
        minResourceFee: 6_000,
        crashDetail: {
          failureCategory: 'BudgetExceeded',
          signature: 'sig:token',
          payload: JSON.stringify({ contract: 'token', method: 'transfer' }),
          replayAction: 'replay',
        },
      }),
    ];
    const data = aggregateCampaignFeeInsight('campaign-fixture', runs);
    const html = renderToStaticMarkup(
      <ResourceFeeInsightView campaignId="campaign-fixture" data={data} />,
    );

    expect(html).toContain('Resource Fee Insight');
    expect(html).toContain('CPU instructions');
    expect(html).toContain('Memory');
    expect(html).toContain('Min resource fee');
    expect(html).toContain('warn');
    expect(html).toContain('flag');
    expect(html).toContain('Fee trend');
    expect(html).toContain('Top expensive fixtures');
    expect(html).toContain('/runs/run-c');
  });

  it('surfaces legacy coverage when runs predate the fee envelope', () => {
    const legacy = {
      ...makeRun({ id: 'legacy-run', campaignId: 'campaign-legacy' }),
      feeWarnThreshold: undefined,
      resourceUsage: undefined,
      fee: undefined,
    } as FuzzingRun;
    const data = aggregateCampaignFeeInsight('campaign-legacy', [legacy]);
    const html = renderToStaticMarkup(
      <ResourceFeeInsightView campaignId="campaign-legacy" data={data} />,
    );
    expect(html).toContain('Partial fee coverage');
    expect(html).toContain('predate the W5-A12 fee envelope');
  });
});

describe('RunFeeSummaryChip', () => {
  it('renders an expensive_success marker with campaign link', () => {
    const html = renderToStaticMarkup(<RunFeeSummaryChip run={makeRun()} />);
    expect(html).toContain('expensive_success');
    expect(html).toContain('/campaigns/campaign-fixture');
  });

  it('renders an explicit expensive_failure marker', () => {
    const run = makeRun({
      status: 'failed',
      fee: { minResourceFee: 6_000, expensiveFailure: true },
    });
    const html = renderToStaticMarkup(<RunFeeSummaryChip run={run} />);
    expect(html).toContain('expensive_failure');
  });

  it('renders the fee-data-absent explanation', () => {
    const run = {
      ...makeRun(),
      cpuInstructions: undefined,
      memoryBytes: undefined,
      minResourceFee: undefined,
      feeWarnThreshold: undefined,
      resourceUsage: undefined,
      fee: undefined,
    } as unknown as FuzzingRun;
    const html = renderToStaticMarkup(<RunFeeSummaryChip run={run} />);
    expect(html).toContain('Fee data unavailable');
    expect(html).toContain('predates W5-A12');
  });
});
