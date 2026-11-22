import React from 'react';
import {
  EmptyStateIllustration,
  EmptyStateIllustrationVariant,
  EmptyStateIllustrationSize,
} from './EmptyStateIllustration';

export interface EmptyStateProps {
  /**
   * The semantic type of list/entity: 'runs' | 'logs' | 'artifacts' | 'generic'
   */
  variant?: EmptyStateIllustrationVariant;
  /**
   * Alias for variant
   */
  type?: EmptyStateIllustrationVariant;
  /**
   * Size of the illustration: 'sm' | 'md' | 'lg'
   */
  size?: EmptyStateIllustrationSize;
  /**
   * Primary title or message
   */
  title?: React.ReactNode;
  /**
   * Alias for title/message for backward compatibility
   */
  message?: React.ReactNode;
  /**
   * Explanatory hint or guidance text
   */
  description?: React.ReactNode;
  /**
   * Optional action element (button, link, or CTA slot)
   */
  action?: React.ReactNode;
  /**
   * Custom illustration override
   */
  illustration?: React.ReactNode;
  /**
   * Additional container class names
   */
  className?: string;
  /**
   * Compact padding mode for inline or confined panel usage
   */
  compact?: boolean;
}

const defaultTitles: Record<EmptyStateIllustrationVariant, string> = {
  runs: 'No fuzzing runs found',
  logs: 'No log entries found',
  artifacts: 'No artifacts available',
  generic: 'No items found',
};

export function EmptyState({
  variant,
  type,
  size = 'md',
  title,
  message,
  description,
  action,
  illustration,
  className = '',
  compact = false,
}: EmptyStateProps) {
  const resolvedVariant = variant || type || 'generic';
  const displayTitle = title ?? message ?? defaultTitles[resolvedVariant];

  return (
    <div
      role="region"
      aria-label={typeof displayTitle === 'string' ? displayTitle : 'Empty state'}
      className={`card card-padding text-center border border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center transition-all ${
        compact ? 'py-8 px-4' : 'py-12 sm:py-16 px-6'
      } ${className}`}
    >
      <div className="mb-4 sm:mb-5">
        {illustration ?? (
          <EmptyStateIllustration
            variant={resolvedVariant}
            size={compact ? 'sm' : size}
          />
        )}
      </div>

      {displayTitle && (
        <h3 className="font-semibold text-base sm:text-lg text-zinc-900 dark:text-zinc-100 tracking-tight mb-1.5">
          {displayTitle}
        </h3>
      )}

      {description && (
        <p className="text-meta text-zinc-500 dark:text-zinc-400 max-w-sm sm:max-w-md mx-auto leading-relaxed text-xs sm:text-sm mb-0">
          {description}
        </p>
      )}

      {action && <div className="mt-5 sm:mt-6">{action}</div>}
    </div>
  );
}
