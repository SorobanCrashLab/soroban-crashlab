'use client';

import { useEffect, useRef } from 'react';

interface ParallaxCarouselProps {
  children: React.ReactNode;
  depth?: number;
}

export function ParallaxCarousel({ children, depth = 0.35 }: ParallaxCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const layers = track.querySelectorAll<HTMLElement>('[data-parallax]');
    let raf = 0;
    const update = () => {
      const vh = window.innerHeight;
      for (const layer of layers) {
        const speed = parseFloat(layer.dataset.parallax || String(depth));
        const rect = layer.getBoundingClientRect();
        const progress = (vh - rect.top) / (vh + rect.height);
        const clamped = Math.min(1, Math.max(0, progress));
        const offset = (clamped - 0.5) * 80 * speed;
        layer.style.transform = `translateY(${offset}px)`;
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
  }, [depth]);

  return (
    <div
      ref={trackRef}
      className="parallax-carousel flex overflow-x-auto gap-4 py-4 snap-x snap-mandatory scroll-smooth"
      style={{ scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}
    >
      {children}
      <style>{`.parallax-carousel > * { scroll-snap-align: center; flex-shrink: 0; }`}</style>
    </div>
  );
}

export function ParallaxItem({
  children,
  background,
  className = '',
}: {
  children: React.ReactNode;
  background?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-xl ${className}`} style={{ willChange: 'transform' }}>
      {background && (
        <div
          data-parallax="0.35"
          className="absolute inset-0"
          style={{ willChange: 'transform', transform: 'translateY(0)' }}
          aria-hidden
        >
          {background}
        </div>
      )}
      <div className="relative" style={{ willChange: 'transform' }}>
        {children}
      </div>
    </div>
  );
}

export function ParallaxLayer({
  children,
  speed = 0.35,
  className = '',
}: {
  children: React.ReactNode;
  speed?: number;
  className?: string;
}) {
  return (
    <div data-parallax={String(speed)} className={className} style={{ willChange: 'transform' }}>
      {children}
    </div>
  );
}
