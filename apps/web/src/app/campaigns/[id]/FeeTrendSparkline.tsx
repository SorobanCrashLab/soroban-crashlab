import type { FeeTrendPoint } from '../../resource-fee-insight-utils';
import type { ResourceThresholds } from '../../resource-fee-utils';
import { formatFee } from '../../run-metrics';

interface FeeTrendSparklineProps {
  points: FeeTrendPoint[];
  thresholds: ResourceThresholds;
  downsampled: boolean;
  bucketMs: number;
}

function formatBucket(bucketMs: number): string {
  if (bucketMs >= 7 * 24 * 60 * 60 * 1000) return 'week';
  if (bucketMs >= 24 * 60 * 60 * 1000) return 'day';
  if (bucketMs >= 60 * 60 * 1000) return 'hour';
  if (bucketMs >= 60 * 1000) return 'minute';
  return 'bucket';
}

export function FeeTrendSparkline({
  points,
  thresholds,
  downsampled,
  bucketMs,
}: FeeTrendSparklineProps) {
  if (points.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Fee trend</h3>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          No timestamped fee samples yet. Trend appears once runs finish with resource data.
        </p>
      </div>
    );
  }

  const width = 100;
  const height = 32;
  const maxValue = Math.max(
    thresholds.feeCritical,
    ...points.map((point) => point.avgFee),
    1,
  );
  const minTs = points[0].ts;
  const maxTs = points[points.length - 1].ts;
  const span = Math.max(1, maxTs - minTs);
  const toX = (ts: number) => ((ts - minTs) / span) * width;
  const toY = (value: number) => height - Math.min(height, (value / maxValue) * height);
  const polyline = points.map((point) => `${toX(point.ts).toFixed(2)},${toY(point.avgFee).toFixed(2)}`).join(' ');
  const latest = points[points.length - 1];
  const warningY = toY(thresholds.feeWarning);
  const criticalY = toY(thresholds.feeCritical);
  const warningInRange = thresholds.feeWarning <= maxValue;
  const criticalInRange = thresholds.feeCritical <= maxValue;

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Fee trend</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {points.length} {formatBucket(bucketMs)} buckets
          {downsampled ? ' · downsampled' : ''}
        </p>
      </div>

      <svg
        className="mt-3 h-24 w-full"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Average minimum resource fee over ${points.length} ${formatBucket(bucketMs)} buckets. Latest ${formatFee(latest.avgFee)}.`}
      >
        <title>Average minimum resource fee over time</title>
        <line x1="0" y1={height} x2={width} y2={height} className="stroke-zinc-300 dark:stroke-zinc-700" strokeWidth="0.4" />
        {warningInRange && (
          <line
            x1="0"
            y1={warningY}
            x2={width}
            y2={warningY}
            className="stroke-amber-500 dark:stroke-amber-400"
            strokeWidth="0.4"
            strokeDasharray="2 2"
          />
        )}
        {criticalInRange && (
          <line
            x1="0"
            y1={criticalY}
            x2={width}
            y2={criticalY}
            className="stroke-red-500 dark:stroke-red-400"
            strokeWidth="0.4"
            strokeDasharray="2 2"
          />
        )}
        <polyline
          points={polyline}
          fill="none"
          className="stroke-sky-600 dark:stroke-sky-400"
          strokeWidth="1.2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.length === 1 && (
          <circle cx={toX(points[0].ts)} cy={toY(points[0].avgFee)} r="1.4" className="fill-sky-600 dark:fill-sky-400" />
        )}
      </svg>

      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 text-xs text-zinc-600 dark:text-zinc-400">
        <span>
          Latest avg <span className="font-semibold text-zinc-900 dark:text-zinc-100">{formatFee(latest.avgFee)}</span>
          {' · '}
          peak <span className="font-semibold text-zinc-900 dark:text-zinc-100">{formatFee(Math.max(...points.map((point) => point.maxFee)))}</span>
        </span>
        <span className="flex flex-wrap gap-x-3">
          <span className="text-amber-700 dark:text-amber-300">Warn ≥ {formatFee(thresholds.feeWarning)}</span>
          <span className="text-red-700 dark:text-red-300">Flag ≥ {formatFee(thresholds.feeCritical)}</span>
        </span>
      </div>
    </div>
  );
}
