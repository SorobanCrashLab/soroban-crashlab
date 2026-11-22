import React from 'react';
import { GenericPageSkeleton } from './LoadingSkeleton';
import { EmptyState } from './EmptyState';
import { EmptyStateIllustrationVariant } from './EmptyStateIllustration';

export type EmptyStateType = EmptyStateIllustrationVariant;

export type ListStateProps =
  | { state: 'loading'; skeleton?: React.ReactNode }
  | { state: 'error'; message?: React.ReactNode; onRetry?: () => void }
  | {
      state: 'empty';
      type?: EmptyStateType;
      title?: React.ReactNode;
      message?: React.ReactNode;
      description?: React.ReactNode;
      illustration?: React.ReactNode;
      action?: React.ReactNode;
      className?: string;
    }
  | { state: 'success'; children: React.ReactNode };

export function ListState(props: ListStateProps) {
  switch (props.state) {
    case 'loading':
      return (
        <div role="status" aria-live="polite" className="fade-in">
          {props.skeleton ? props.skeleton : <GenericPageSkeleton variant="table" rows={5} />}
        </div>
      );
    case 'error':
      return (
        <div role="alert" className="card card-padding text-center py-8 sm:py-12 fade-in" style={{ borderLeft: '4px solid #CC1016' }}>
          <span className="text-2xl sm:text-3xl mb-2 sm:mb-3 block">⚠</span>
          <p className="font-semibold" style={{ color: '#CC1016' }}>
            {props.message || 'An error occurred while loading data.'}
          </p>
          {props.onRetry && (
            <div className="mt-3 sm:mt-4">
              <button type="button" onClick={props.onRetry} className="btn-primary text-xs sm:text-sm">
                Retry
              </button>
            </div>
          )}
        </div>
      );
    case 'empty':
      return (
        <div className="fade-in">
          <EmptyState
            type={props.type ?? 'generic'}
            title={props.title}
            message={props.message}
            description={props.description}
            illustration={props.illustration}
            action={props.action}
            className={props.className}
          />
        </div>
      );
    case 'success':
      return <>{props.children}</>;
    default:
      // Type-level coverage assertion proving compile-time exhaustiveness enforcement.
      const _exhaustiveCheck: never = props;
      return _exhaustiveCheck;
  }
}
