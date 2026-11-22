'use client';

import { useEffect, useState } from 'react';

export function ScrollProgressBar() {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? window.scrollY / max : 0;
      setWidth(p * 100);
      raf = 0;
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 h-[2px] z-[60] pointer-events-none origin-left"
      style={{
        transform: `scaleX(${width / 100})`,
        background: '#0A66C2',
        willChange: 'transform',
        transition: 'transform 0.08s linear',
      }}
    />
  );
}

export function GlobalScrollEffects({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ScrollProgressBar />
      <div className="scroll-effects-root">{children}</div>
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .page-padding > * {
            animation: page-section-in linear both;
            animation-timeline: view();
            animation-range: entry 0% cover 22%;
          }
          @supports not (animation-timeline: view()) {
            .page-padding > * { animation: none; }
          }
          @keyframes page-section-in {
            from { opacity: 0.92; transform: translateY(6px); }
            to { opacity: 1; transform: translateY(0); }
          }
        }
      `}</style>
    </>
  );
}
