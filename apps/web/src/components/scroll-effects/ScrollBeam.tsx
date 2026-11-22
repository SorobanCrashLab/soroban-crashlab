'use client';

import { useEffect, useRef } from 'react';

interface ScrollBeamProps {
  color?: string;
  thickness?: number;
}

/**
 * Horizontal "beam" line across the viewport center. Content scrolling
 * past the beam transitions from a muted grey state to bright/filled,
 * like an abacus bead being pushed to the counting line.
 *
 * Uses IntersectionObserver for performance. No per-frame scroll
 * calculations for the beam itself (pure CSS).
 */
export function ScrollBeam({ color = '#0A66C2', thickness = 2 }: ScrollBeamProps) {
  return (
    <>
      <div
        aria-hidden
        className="scroll-beam"
        style={{
          position: 'fixed',
          top: '50%',
          left: 0,
          right: 0,
          height: thickness,
          backgroundColor: color,
          opacity: 0.12,
          zIndex: 1,
          pointerEvents: 'none',
          transform: 'translateY(-50%)',
        }}
      />
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .scroll-beam-active {
            transition: opacity 0.5s ease, color 0.5s ease, filter 0.5s ease;
          }
          .scroll-beam-active[data-beam="muted"] {
            opacity: 0.4 !important;
            filter: grayscale(1) brightness(0.7);
          }
          .scroll-beam-active[data-beam="lit"] {
            opacity: 1 !important;
            filter: none;
          }
        }
      `}</style>
    </>
  );
}

/**
 * Wrapper component that tracks whether its child is above, at, or
 * below the viewport center (the "beam"). When the child crosses
 * the beam, it gets data-beam="lit", otherwise "muted".
 *
 * Attach className="scroll-beam-active" to enable the transition.
 */
export function BeamChild({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.setAttribute('data-beam', 'lit');
      return;
    }

    let raf = 0;
    const update = () => {
      const rect = el!.getBoundingClientRect();
      const vh = window.innerHeight;
      const beamY = vh / 2;
      const elTop = rect.top;
      const elBottom = rect.bottom;
      const isAtBeam = elTop <= beamY && elBottom >= beamY;
      el!.setAttribute('data-beam', isAtBeam ? 'lit' : 'muted');
      raf = 0;
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className={`scroll-beam-active ${className}`} data-beam="muted">
      {children}
    </div>
  );
}
