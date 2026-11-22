'use client';

import { useEffect, useRef, useState } from 'react';

interface OdometerCounterProps {
  target: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
}

function formatTarget(target: number, decimals: number) {
  return target.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Counting odometer effect: rapidly cycles through digits before locking
 * onto the final computed value, triggered when the element scrolls
 * into the viewport. Uses Share Tech Mono for the odometer look.
 */
export function OdometerCounter({
  target,
  suffix = '',
  prefix = '',
  decimals = 0,
  duration = 1800,
  className = '',
  style,
}: OdometerCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [display, setDisplay] = useState(() =>
    reducedMotion ? formatTarget(target, decimals) : '0',
  );
  const started = useRef(false);
  const rafRef = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !started.current) {
            started.current = true;
            runCount();
          }
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);

    function runCount() {
      const start = performance.now();
      const scrambleDuration = duration * 0.65;

      function scramble(now: number) {
        const elapsed = now - start;
        if (elapsed >= scrambleDuration) {
          lockToFinal(now);
          return;
        }
        const progress = elapsed / scrambleDuration;
        const maxDigits = decimals > 0 ? 4 : Math.max(1, Math.floor(Math.log10(target)) + 1);
        const visibleDigits = Math.max(1, Math.ceil(progress * maxDigits));
        let randomStr = '';
        for (let i = 0; i < visibleDigits; i++) {
          randomStr += Math.floor(Math.random() * 10);
        }
        if (progress > 0.4) {
          const realStr = formatTarget(target, decimals);
          const realLeading = realStr.slice(0, visibleDigits);
          randomStr = realLeading + randomStr.slice(realLeading.length);
        }
        setDisplay(randomStr);
        rafRef.current = requestAnimationFrame(scramble);
      }

      function lockToFinal(now: number) {
        const elapsed = now - start - scrambleDuration;
        const lockDuration = duration - scrambleDuration;
        const progress = Math.min(1, elapsed / lockDuration);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = eased * target;
        setDisplay(formatTarget(current, decimals));
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(lockToFinal);
        } else {
          setDisplay(formatTarget(target, decimals));
        }
      }

      rafRef.current = requestAnimationFrame(scramble);
    }

    return () => {
      observer.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, decimals, duration, reducedMotion]);

  return (
    <span ref={ref} className={className} style={{ fontFamily: 'var(--font-odometer)', ...style }}>
      {prefix}{display}{suffix}
    </span>
  );
}
