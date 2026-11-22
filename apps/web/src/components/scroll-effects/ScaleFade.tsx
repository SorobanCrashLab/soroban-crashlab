'use client';

import { useEffect, useRef } from 'react';

interface ScaleFadeProps {
  children: React.ReactNode;
  className?: string;
  threshold?: number;
}

export function ScaleFade({ children, className = '', threshold = 0.15 }: ScaleFadeProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.style.opacity = '1';
      el.style.transform = 'none';
      return;
    }

    let raf = 0;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const center = rect.top + rect.height / 2;
      const viewportCenter = vh / 2;
      const maxDist = vh / 2 + rect.height / 2;
      const dist = Math.abs(center - viewportCenter) / maxDist;
      const clamped = Math.min(1, Math.max(0, dist));
      const scale = 1 - clamped * 0.22;
      const opacity = 1 - clamped * 0.75;
      const y = (1 - Math.min(1, Math.max(0, (vh - rect.top) / (vh * 0.6)))) * 16;
      el.style.transform = `scale(${scale}) translateY(${y * clamped}px)`;
      el.style.opacity = String(Math.max(0.12, opacity));
      raf = 0;
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };
    // Initial state before observer
    el.style.willChange = 'transform, opacity';
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            window.addEventListener('scroll', onScroll, { passive: true });
            window.addEventListener('resize', onScroll, { passive: true });
            update();
          } else {
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
          }
        }
      },
      { threshold, rootMargin: '100px' },
    );
    observer.observe(el);
    // Fire once in case already visible
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [threshold]);

  return (
    <div ref={ref} className={className} style={{ opacity: 0.15, transform: 'scale(0.88)' }}>
      {children}
    </div>
  );
}

export function ScaleFadeStagger({
  children,
  staggerMs = 70,
  className = '',
}: {
  children: React.ReactNode[];
  staggerMs?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      {children.map((child, i) => (
        <ScaleFade key={i} threshold={0.1} className="" >
          <div style={{ transitionDelay: `${i * staggerMs}ms` }}>{child}</div>
        </ScaleFade>
      ))}
    </div>
  );
}
