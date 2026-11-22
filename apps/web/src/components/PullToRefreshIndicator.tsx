'use client';

const THRESHOLD = 72;

interface PullToRefreshIndicatorProps {
  isPulling: boolean;
  isRefreshing: boolean;
  pullDistance: number;
}

export function PullToRefreshIndicator({
  isPulling,
  isRefreshing,
  pullDistance,
}: PullToRefreshIndicatorProps) {
  const visible = isPulling || isRefreshing;
  if (!visible) return null;

  const progress = Math.min(pullDistance / THRESHOLD, 1);
  const rotation = progress * 270;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={isRefreshing ? 'Refreshing…' : 'Pull to refresh'}
      style={{
        position: 'fixed',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 14px',
        borderRadius: 9999,
        background: 'var(--surface)',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--card-shadow)',
        fontSize: 13,
        color: 'var(--text-secondary)',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={isRefreshing ? 'animate-spin' : ''}
        style={{
          transition: isRefreshing ? undefined : 'transform 0.1s linear',
          transform: isRefreshing ? undefined : `rotate(${rotation}deg)`,
          color: '#0A66C2',
        }}
        aria-hidden="true"
      >
        <path d="M4 4v5h.582M20 20v-5h-.581M5.635 15A9 9 0 1 0 5.636 9" />
      </svg>
      <span>{isRefreshing ? 'Refreshing…' : progress >= 1 ? 'Release to refresh' : 'Pull to refresh'}</span>
    </div>
  );
}
