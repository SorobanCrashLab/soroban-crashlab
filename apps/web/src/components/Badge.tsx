import type { HTMLAttributes } from 'react';

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'error' | 'info';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({
  variant = 'neutral',
  className = '',
  ...props
}: BadgeProps) {
  return <span className={`ds-badge ds-badge-${variant} ${className}`} {...props} />;
}
