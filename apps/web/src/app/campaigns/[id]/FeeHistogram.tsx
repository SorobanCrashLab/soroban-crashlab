import type { FeeHistogram as FeeHistogramData, FeeMetric } from '../../resource-fee-insight-utils';
import { formatBytes, formatNumber } from '../../run-metrics';

const METRIC_LABELS: Record<FeeMetric, string> = {
  cpu: 'CPU instructions',
  memory: 'Memory',
  fee: 'Min resource fee',
};

export function formatFeeMetricValue(metric: FeeMetric, value: number): string {
  if (metric === 'memory') return formatBytes(value);
  if (metric === 'fee') return `${Math.round(value).toLocaleString()} stroops`;
  return formatNumber(value);
}

export function FeeHistogram({ histogram }: { histogram: FeeHistogramData }) {
  const { metric } = histogram;
  const label = METRIC_LABELS[metric];
  const maxCount = Math.max(1, ...histogram.buckets.map((bucket) => bucket.count));
  // Keep out-of-range thresholds visible at the edge; a campaign with no
  // expensive runs should still show where the warn/flag lines sit.
  const markers = [histogram.warningMarker, histogram.criticalMarker];

  return (
    <figure
      className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/30"
      aria-labelledby={`fee-histogram-${metric}`}
    >
      <figcaption
        id={`fee-histogram-${metric}`}
        className="flex flex-wrap items-baseline justify-between gap-2"
      >
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{label}</span>
        <span className="text-meta">{histogram.total} runs</span>
      </figcaption>

      {histogram.total === 0 ? (
        <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">
          No {label.toLowerCase()} samples recorded for this campaign.
        </p>
      ) : (
        <>
          <div
            className="relative mt-4 h-32 rounded-lg border border-zinc-200 bg-white/70 p-2 dark:border-zinc-800 dark:bg-zinc-950/40"
            role="img"
            aria-label={`${label} distribution across ${histogram.total} runs, from ${formatFeeMetricValue(metric, histogram.min)} to ${formatFeeMetricValue(metric, histogram.max)}`}
          >
            <div className="flex h-full items-end gap-0.5" aria-hidden="true">
              {histogram.buckets.map((bucket) => {
                const height = bucket.count === 0 ? 0 : Math.max(6, (bucket.count / maxCount) * 100);
                return (
                  <div
                    key={bucket.index}
                    className="flex h-full flex-1 items-end"
                    title={`${formatFeeMetricValue(metric, bucket.start)} – ${formatFeeMetricValue(metric, bucket.end)}: ${bucket.count} run${bucket.count === 1 ? '' : 's'}`}
                  >
                    <div
                      className={`w-full rounded-t-sm ${bucket.count > 0 ? 'bg-sky-500/80 dark:bg-sky-400/80' : 'bg-transparent'}`}
                      style={{ height: `${height}%` }}
                    />
                  </div>
                );
              })}
            </div>

            {markers.map((marker) => (
              <div
                key={marker.level}
                className={`pointer-events-none absolute inset-y-1 border-l-2 border-dashed ${
                  marker.level === 'critical'
                    ? 'border-red-500 dark:border-red-400'
                    : 'border-amber-500 dark:border-amber-400'
                }`}
                style={{ left: `calc(${marker.position}% - 1px)` }}
                aria-hidden="true"
              >
                <span
                  className={`absolute -top-0.5 left-1 rounded px-1 text-[10px] font-semibold uppercase tracking-wide ${
                    marker.level === 'critical'
                      ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                  }`}
                >
                  {marker.level === 'critical' ? 'flag' : 'warn'}
                </span>
              </div>
            ))}
          </div>

          <ul className="sr-only">
            {histogram.buckets.map((bucket) => (
              <li key={bucket.index}>
                {formatFeeMetricValue(metric, bucket.start)} to{' '}
                {formatFeeMetricValue(metric, bucket.end)}: {bucket.count} runs
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
            <span>
              <span className="font-medium text-amber-700 dark:text-amber-300">Warn</span> ≥{' '}
              {formatFeeMetricValue(metric, histogram.warning)}
            </span>
            <span>
              <span className="font-medium text-red-700 dark:text-red-300">Flag</span> ≥{' '}
              {formatFeeMetricValue(metric, histogram.critical)}
            </span>
            <span>
              Range: {formatFeeMetricValue(metric, histogram.min)} –{' '}
              {formatFeeMetricValue(metric, histogram.max)}
            </span>
          </div>
        </>
      )}
    </figure>
  );
}
