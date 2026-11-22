'use client';

import { Children, isValidElement } from 'react';

interface StickyStackProps {
  children: React.ReactNode;
  offsetStep?: number;
}

export function StickyStack({ children, offsetStep = 16 }: StickyStackProps) {
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <div className="sticky-stack" style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '30vh' }}>
      {items.map((child, index) => (
        <div
          key={index}
          className="sticky-stack-card"
          style={{
            position: 'sticky',
            top: `calc(64px + ${index * offsetStep}px)`,
            zIndex: index,
            willChange: 'transform',
          }}
        >
          <div
            className="sticky-stack-inner"
            style={{
              background: 'var(--surface)',
              borderRadius: '8px',
              boxShadow: 'var(--card-shadow)',
              border: '1px solid var(--border-color)',
              overflow: 'hidden',
            }}
          >
            {child}
          </div>
        </div>
      ))}
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .sticky-stack-card { position: relative !important; top: auto !important; }
        }
        /* Ensure sticky cards paint in correct stacking context */
        .sticky-stack { isolation: isolate; }
      `}</style>
    </div>
  );
}
