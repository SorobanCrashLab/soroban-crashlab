'use client';

import React, { ReactNode, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

export interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

export function PageTransition({ children, className = '' }: PageTransitionProps) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof document === 'undefined') return;
    if (!document.startViewTransition) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
  }, [pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = setTimeout(() => {
      const shell = document.getElementById('page-shell');
      if (shell) shell.scrollTop = 0;
    }, 0);
    return () => clearTimeout(t);
  }, [pathname]);

  return (
    <div
      ref={ref}
      key={pathname}
      className={`page-transition-container ${className}`}
      data-view-transition="page"
      style={{
        minHeight: '100%',
        willChange: 'transform, opacity',
        contentVisibility: 'auto',
        containIntrinsicSize: 'auto 800px',
      }}
    >
      {children}
    </div>
  );
}

export default PageTransition;
