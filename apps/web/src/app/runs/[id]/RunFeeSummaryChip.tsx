import Link from 'next/link';
import type { FuzzingRun } from '../../types';
import { buildRunFeeSummary } from '../../resource-fee-insight-utils';
import { formatBytes, formatFee, formatNumber } from '../../run-metrics';

interface RunFeeSummaryChipProps {
  run: FuzzingRun;
}

const LEVEL_STYLES = {
  normal:
    'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-200 dark:border-emerald-900/50',
  warning:
    'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/20 dark:text-amber-100 dark:border-amber-900/50',
  critical:
    'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/20 dark:text-red-200 dark:border-red-900/50',
  unknown:
    'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800',
} as const;

/**
 * Compact metering summary for the run detail page (#1883).
 *
 * Shows the A12 expensive-success/failure marker when present and a warn/flag
 * level otherwise. Runs without a fee envelope fall back to flat metrics; runs
 * with no metrics at all explain the pre-W5-A12 gap instead of rendering zeros.
 */
export function RunFeeSummaryChip({ run }: RunFeeSummaryChipProps) {
  const summary = buildRunFeeSummary(run);

  if (!summary.hasFeeData) {
    return (
      <div
        className={`mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3 text-sm ${LEVEL_STYLES.unknown}`}
        role="status"
        aria-label="Fee data unavailable"
        data-fee-source="absent"
      >
        <span className="rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          Fee data unavailable
        </span>
        <span>
          This run predates W5-A12 fee tracking, so there is no metering envelope to
          chart.
        </span>
      </div>
    );
  }

  const marker = summary.expensiveFailure
    ? { label: 'expensive_failure', style: LEVEL_STYLES.critical }
    : summary.expensiveSuccess
      ? { label: 'expensive_success', style: LEVEL_STYLES.warning }
      : summary.levels.overall === 'unknown'
        ? { label: 'Metering unknown', style: LEVEL_STYLES.unknown }
        : {
            label:
              summary.levels.overall === 'critical'
                ? 'Metering flag'
                : summary.levels.overall === 'warning'
                  ? 'Metering warning'
                  : 'Metering normal',
            style: LEVEL_STYLES[summary.levels.overall],
          };

  return (
    <div
      className={`mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3 text-sm ${marker.style}`}
      role="status"
      data-fee-source={summary.source}
      aria-label={`Resource fee summary: ${marker.label}`}
    >
      <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide dark:bg-black/20">
        {marker.label}
      </span>
      {summary.cpuInstructions !== null && (
        <span>
          <span className="opacity-70">CPU</span>{' '}
          <span className="font-semibold">{formatNumber(summary.cpuInstructions)}</span>
        </span>
      )}
      {summary.memoryBytes !== null && (
        <span>
          <span className="opacity-70">Memory</span>{' '}
          <span className="font-semibold">{formatBytes(summary.memoryBytes)}</span>
        </span>
      )}
      {summary.minResourceFee !== null && (
        <span>
          <span className="opacity-70">Min fee</span>{' '}
          <span className="font-semibold">{formatFee(summary.minResourceFee)}</span>
        </span>
      )}
      {summary.source === 'legacy' && (
        <span className="rounded-full border border-current/30 px-2.5 py-0.5 text-xs font-medium">
          Legacy metrics · pre-W5-A12
        </span>
      )}
      {summary.campaignHref && (
        <Link
          href={summary.campaignHref}
          className="ml-auto text-xs font-semibold underline decoration-dotted underline-offset-4"
        >
          Campaign fee panel
        </Link>
      )}
    </div>
  );
}
