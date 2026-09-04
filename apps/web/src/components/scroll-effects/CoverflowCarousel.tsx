'use client';

import { Children, cloneElement, isValidElement, useEffect, useRef } from 'react';

interface CoverflowCarouselProps {
  children: React.ReactNode;
  gap?: number;
}

export function CoverflowCarousel({ children, gap: _gap = 16 }: CoverflowCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const items = Array.from(track.children) as HTMLElement[];
    if (items.length === 0) return;

    let raf = 0;
    const update = () => {
      const viewportCenter = track.getBoundingClientRect().left + track.clientWidth / 2;
      for (const item of items) {
        const rect = item.getBoundingClientRect();
        const itemCenter = rect.left + rect.width / 2;
        const dist = (itemCenter - viewportCenter) / (track.clientWidth / 2);
        const abs = Math.abs(dist);
        const rotate = dist * -35;
        const scale = Math.max(0.72, 1 - abs * 0.28);
        const brightness = Math.max(0.6, 1 - abs * 0.35);
        const z = Math.round((1 - abs) * 10);
        item.style.transform = `perspective(900px) rotateY(${rotate}deg) scale(${scale})`;
        item.style.filter = `brightness(${brightness})`;
        item.style.zIndex = String(z);
        item.style.opacity = String(Math.max(0.45, 1 - abs * 0.55));
      }
      raf = 0;
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();
    return () => {
      track.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
      for (const item of items) {
        item.style.transform = '';
        item.style.filter = '';
        item.style.zIndex = '';
        item.style.opacity = '';
      }
    };
  }, [children]);

  return (
    <div
      ref={trackRef}
      className="coverflow-track flex overflow-x-auto gap-4 py-6 px-6 scroll-smooth snap-x snap-mandatory"
      style={{
        scrollbarWidth: 'thin',
        WebkitOverflowScrolling: 'touch',
        perspective: '900px',
        transformStyle: 'preserve-3d',
      }}
    >
      {Children.map(children, (child) => {
        if (!isValidElement<{ style?: React.CSSProperties }>(child)) return child;
        const existing = (child as React.ReactElement<{ style?: React.CSSProperties }>).props.style;
        return cloneElement(child as React.ReactElement<{ style?: React.CSSProperties; className?: string }>, {
          style: {
            ...(existing as React.CSSProperties | undefined),
            willChange: 'transform, filter, opacity',
            transition: 'transform 0.15s linear, filter 0.15s linear, opacity 0.15s linear',
            flexShrink: 0,
          } as React.CSSProperties,
        });
      })}
      <style>{`.coverflow-track > * { scroll-snap-align: center; }`}</style>
    </div>
  );
}

export function CoverflowItem({
  children,
  className = '',
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`coverflow-item ${className}`} style={style}>
      {children}
    </div>
  );
}
