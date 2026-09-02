import React, { memo, ReactNode } from 'react';

export interface StatCardTrend {
  value: string | number;
  isPositive?: boolean;
  label?: string;
}

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  subtext?: ReactNode;
  trend?: StatCardTrend | ReactNode;
  icon?: ReactNode;
  variant?: 'default' | 'card' | 'interactive' | 'compact';
  className?: string;
  onClick?: () => void;
  'data-testid'?: string;
}

export const StatCard = memo(function StatCard({
  label,
  value,
  subtext,
  trend,
  icon,
  variant = 'default',
  className = '',
  onClick,
  'data-testid': testId,
}: StatCardProps) {
  const isInteractive = variant === 'interactive' || Boolean(onClick);

  const baseClasses = (() => {
    switch (variant) {
      case 'compact':
        return 'card card-padding py-3 px-4';
      case 'interactive':
        return 'card card-padding stat-card card-interactive cursor-pointer hover:shadow-md transition';
      case 'card':
      case 'default':
      default:
        return 'card card-padding stat-card';
    }
  })();

  const renderTrend = () => {
    if (!trend) return null;
    if (React.isValidElement(trend)) return trend;

    const t = trend as StatCardTrend;
    const isPositive = t.isPositive ?? true;
    return (
      <span
        className={`inline-flex items-center text-xs font-semibold mt-1 gap-0.5 ${
          isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
        }`}
      >
        <span>{isPositive ? '↑' : '↓'}</span>
        <span>{t.value}</span>
        {t.label && <span className="text-muted ml-1 font-normal">{t.label}</span>}
      </span>
    );
  };

  return (
    <div
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        isInteractive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      data-testid={testId}
      className={`${baseClasses} ${className}`}
    >
      {icon && <div className="stat-icon mb-2 flex items-center justify-center text-primary">{icon}</div>}
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {subtext && <div className="text-xs text-meta mt-1">{subtext}</div>}
      {renderTrend()}
    </div>
  );
});

export default StatCard;
