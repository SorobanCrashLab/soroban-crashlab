import Link from 'next/link';
import type { CampaignFeeInsight, FeeDataSource } from '../../resource-fee-insight-utils';
import { formatBytes, formatNumber } from '../../run-metrics';
import { ExpensiveFixtureTable } from './ExpensiveFixtureTable';
import { FeeInsightSkeleton } from './FeeInsightSkeleton';
import { FeeHistogram } from './FeeHistogram';
import { FeeTrendSparkline } from './FeeTrendSparkline';

export type FeeInsightViewState = 'loading' | 'error' | 'success';

export interface ResourceFeeInsightViewProps {
  campaignId: string;
  data?: CampaignFeeInsight | null;
  dataState?: FeeInsightViewState;
  errorMessage?: string;
  onRetry?: () => void;
}

function CoverageNote({ data }: { data: CampaignFeeInsight }) {
  const { coverage } = data;
  const notes: string[] = [];

  if (coverage.absent > 0) {
    notes.push(
      `${coverage.absent} of ${data.runCount} runs have no resource metrics and are excluded from the distributions.`,
    );
  }
  if (coverage.legacy > 0) {
    notes.push(
      `${coverage.legacy} run${coverage.legacy === 1 ? '' : 's'} predate the W5-A12 fee envelope; their flat CPU, memory and minimum fee values are used instead.`,
    );
  }

  if (notes.length === 0) return null;

  return (
    <div
      className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100"
      role="note"
    >
      <p className="font-medium">Partial fee coverage</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-amber-800 dark:text-amber-200">
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}

const SOURCE_LABELS: Record<FeeDataSource, string> = {
  envelope: 'W5-A12 envelope',
  legacy: 'Legacy flat metrics',
  absent: 'No fee data',
};

function NoFeeData({ campaignId, data }: { campaignId: string; data: CampaignFeeInsight }) {
  if (data.runCount === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/70 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/30">
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          No runs in this campaign yet
        </h3>
        <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
          Start a run for <span className="font-mono">{campaignId}</span> to see resource
          distributions, threshold crossings and expensive fixtures here.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link href="/start" className="btn-primary text-sm">
            Start a campaign
          </Link>
          <Link href="/runs" className="btn-outline text-sm">
            Browse runs
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/70 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/30">
      <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
        No fee tracking data for this campaign
      </h3>
      <p className="mx-auto mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
        These runs were recorded before per-seed fee and resource tracking was enabled
        (W5-A12), so there is no metering envelope to chart. Start a new campaign after
        fee simulation is enabled; its runs will populate histograms, threshold crossings,
        the fee trend and expensive-success/failure flags.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <Link href="/start" className="btn-primary text-sm">
          Start a campaign with fee tracking
        </Link>
        <Link href="/runs" className="btn-outline text-sm">
          Browse existing runs
        </Link>
      </div>
    </div>
  );
}

export function ResourceFeeInsightView({
  campaignId,
  data,
  dataState,
  errorMessage,
  onRetry,
}: ResourceFeeInsightViewProps) {
  const state: FeeInsightViewState = dataState ?? (data ? 'success' : 'loading');

  if (state === 'loading') {
    return <FeeInsightSkeleton />;
  }

  if (state === 'error') {
    return (
      <section
        role="alert"
        className="w-full rounded-2xl border border-red-200 bg-red-50/60 p-6 shadow-sm dark:border-red-900/50 dark:bg-red-950/20"
      >
        <h2 className="text-xl font-bold text-red-900 dark:text-red-100">
          Resource Fee Insight
        </h2>
        <p className="mt-2 text-sm text-red-700 dark:text-red-300">
          {errorMessage ??
            'Resource metrics are unavailable. Retry to refresh fee diagnostics.'}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            Retry resource insight
          </button>
        )}
      </section>
    );
  }

  if (!data) {
    return <FeeInsightSkeleton />;
  }

  if (!data.hasFeeData) {
    return (
      <section className="w-full space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          Resource Fee Insight
        </h2>
        <NoFeeData campaignId={campaignId} data={data} />
      </section>
    );
  }

  const { totals, thresholds, histograms } = data;
  const coverageTotal = Math.max(1, data.runCount);
  const envelopePct = Math.round((data.coverage.envelope / coverageTotal) * 100);
  const source: FeeDataSource =
    data.coverage.envelope > 0
      ? 'envelope'
      : data.coverage.legacy > 0
        ? 'legacy'
        : 'absent';

  return (
    <section className="w-full space-y-5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            Resource Fee Insight
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Metering risk for <span className="font-mono">{campaignId}</span> ·{' '}
            {data.runCount} run{data.runCount === 1 ? '' : 's'} · {SOURCE_LABELS[source]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-zinc-100 px-3 py-1 font-medium text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            {envelopePct}% envelope coverage
          </span>
          {data.expensiveSuccessCount + data.expensiveFailureCount > 0 && (
            <span className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-800 dark:bg-red-950/40 dark:text-red-200">
              {data.expensiveSuccessCount + data.expensiveFailureCount} expensive
            </span>
          )}
        </div>
      </div>

      <CoverageNote data={data} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
            Campaign fee spend
          </p>
          <p className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {totals.totalFee.toLocaleString()}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">stroops total</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
            Average fee / run
          </p>
          <p className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {totals.avgFee.toLocaleString()}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            peak {totals.maxFee.toLocaleString()} stroops
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
            Threshold crossings
          </p>
          <p className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {data.thresholdCrossings.total}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            fee {data.thresholdCrossings.fee.crossingCount} · cpu{' '}
            {data.thresholdCrossings.cpu.crossingCount} · mem{' '}
            {data.thresholdCrossings.memory.crossingCount}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
            Expensive outcomes
          </p>
          <p className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {data.expensiveSuccessCount + data.expensiveFailureCount}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {data.expensiveSuccessCount} expensive_success · {data.expensiveFailureCount}{' '}
            expensive_failure
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <FeeHistogram histogram={histograms.cpu} />
        <FeeHistogram histogram={histograms.memory} />
        <FeeHistogram histogram={histograms.fee} />
      </div>

      <FeeTrendSparkline
        points={data.trend}
        thresholds={thresholds}
        downsampled={data.trendDownsampled}
        bucketMs={data.trendBucketMs}
      />

      <ExpensiveFixtureTable fixtures={data.expensiveFixtures} />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-zinc-50 px-4 py-3 text-xs text-zinc-600 dark:bg-zinc-900/30 dark:text-zinc-400">
        <span>
          Configurable thresholds: CPU warn {formatNumber(thresholds.cpuWarning)} / flag{' '}
          {formatNumber(thresholds.cpuCritical)} · memory warn {formatBytes(thresholds.memoryWarning)}{' '}
          / flag {formatBytes(thresholds.memoryCritical)} · fee warn{' '}
          {thresholds.feeWarning.toLocaleString()} / flag{' '}
          {thresholds.feeCritical.toLocaleString()} stroops
        </span>
        {data.trendDownsampled && (
          <span className="font-medium text-sky-700 dark:text-sky-300">
            Long campaign: trend downsampled to {data.trend.length} points
          </span>
        )}
      </div>
    </section>
  );
}
