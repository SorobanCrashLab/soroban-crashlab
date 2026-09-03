'use client';

import React, { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

export interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/**
 * PageTransition wrapper component.
 * Integrates with CSS View Transitions and provides consistent entry animation
 * for route navigation across the Navy Professional design system.
 */
export function PageTransition({ children, className = '' }: PageTransitionProps) {
  const pathname = usePathname();

  return (
    <div
      key={pathname}
      className={`page-transition-container fade-in ${className}`}
      data-view-transition="page"
      style={{
        minHeight: '100%',
        willChange: 'transform, opacity',
      }}
    >
      {children}
    </div>
  );
}

export default PageTransition;
