export type RegressionStatus = 'idle' | 'running' | 'passed' | 'failed';

interface RegressionStatusBadgeProps {
  status: RegressionStatus;
}

const STATUS_STYLES: Record<RegressionStatus, string> = {
  idle: 'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300',
  running: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300',
  passed: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  failed: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
};

const STATUS_LABELS: Record<RegressionStatus, string> = {
  idle: 'Idle',
  running: 'Running regression',
  passed: 'Regression passed',
  failed: 'Regression failed',
};

export default function RegressionStatusBadge({ status }: RegressionStatusBadgeProps) {
  const isRunning = status === 'running';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[status]}`}
      aria-label={`Regression suite status: ${STATUS_LABELS[status]}`}
    >
      {isRunning && (
        <span className="relative inline-flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-60" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current" />
        </span>
      )}
      {STATUS_LABELS[status]}
    </span>
  );
}