import { statusColorToken } from '../lib/a11y/contrast';

export type RegressionStatus = 'idle' | 'running' | 'passed' | 'failed';

interface RegressionStatusBadgeProps {
  status: RegressionStatus;
}

const STATUS_LABELS: Record<RegressionStatus, string> = {
  idle: 'Idle',
  running: 'Running regression',
  passed: 'Regression passed',
  failed: 'Regression failed',
};

export default function RegressionStatusBadge({ status }: RegressionStatusBadgeProps) {
  const token = statusColorToken(status);
  const isRunning = status === 'running';
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold"
      style={{
        color: token.foreground,
        backgroundColor: token.background,
        borderColor: token.border,
      }}
      aria-label={`Regression suite status: ${STATUS_LABELS[status]}`}
    >
      <span aria-hidden="true" className="text-[0.75em] leading-none">
        {token.symbol}
      </span>
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
