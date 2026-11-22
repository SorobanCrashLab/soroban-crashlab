'use client';

import { useEffect, useRef } from 'react';

interface TextRevealProps {
  children: React.ReactNode;
  className?: string;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'div' | 'span';
}

export function TextReveal({ children, className = '', as: Tag = 'div' }: TextRevealProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current as HTMLElement | null;
    if (!el) return;
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.style.setProperty('--reveal', '1');
      const inner = el.querySelector<HTMLElement>('[data-reveal-inner]');
      if (inner) inner.style.transform = 'translateX(0)';
      return;
    }

    let raf = 0;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const progress = Math.min(1, Math.max(0, (vh - rect.top) / (vh * 0.65 + rect.height)));
      el.style.setProperty('--reveal', String(progress));
      const inner = el.querySelector<HTMLElement>('[data-reveal-inner]');
      if (inner) {
        const offset = (1 - progress) * 100;
        inner.style.transform = `translateX(-${offset}%)`;
      }
      const mask = el.querySelector<HTMLElement>('[data-reveal-mask]');
      if (mask) {
        mask.style.transform = `translateX(${progress * 100}%)`;
      }
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
    // @ts-expect-error dynamic tag
    <Tag ref={ref} className={`text-reveal ${className}`} style={{ ['--reveal' as string]: '0' } as React.CSSProperties}>
      <span className="text-reveal-clip" style={{ display: 'block', overflow: 'hidden' }}>
        <span data-reveal-inner style={{ display: 'block', willChange: 'transform', transform: 'translateX(-100%)' }}>
          {children}
        </span>
      </span>
      <span
        data-reveal-mask
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--surface)',
          willChange: 'transform',
          transform: 'translateX(0%)',
          pointerEvents: 'none',
        }}
      />
      <style>{`
        .text-reveal { position: relative; }
        @media (prefers-reduced-motion: reduce) {
          .text-reveal [data-reveal-inner] { transform: none !important; }
          .text-reveal [data-reveal-mask] { display: none !important; }
        }
      `}</style>
    </Tag>
  );
}

export function TextRevealSplit({
  background,
  foreground,
  className = '',
}: {
  background: React.ReactNode;
  foreground: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const progress = Math.min(1, Math.max(0, (vh - rect.top) / (vh * 0.7 + rect.height)));
      const bg = el.querySelector<HTMLElement>('[data-split-bg]');
      const fg = el.querySelector<HTMLElement>('[data-split-fg]');
      if (bg) bg.style.transform = `translateX(${(progress - 0.5) * -30}px)`;
      if (fg) {
        const maskProgress = Math.min(1, Math.max(0, (progress - 0.15) / 0.7));
        fg.style.setProperty('--split', String(maskProgress));
        const inner = fg.querySelector<HTMLElement>('[data-split-inner]');
        if (inner) inner.style.transform = `translateX(${(1 - maskProgress) * -100}%)`;
      }
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
    <div ref={ref} className={`relative overflow-hidden ${className}`}>
      <div data-split-bg style={{ willChange: 'transform' }}>
        {background}
      </div>
      <div
        data-split-fg
        className="absolute inset-0 flex items-center"
        style={{ willChange: 'transform' } as React.CSSProperties}
      >
        <div style={{ overflow: 'hidden', width: '100%' }}>
          <div data-split-inner style={{ willChange: 'transform', transform: 'translateX(-100%)' }}>
            {foreground}
          </div>
        </div>
      </div>
    </div>
  );
}
