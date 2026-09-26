import { useEffect, useState } from 'react';

/**
 * Checks whether the user has requested reduced motion via their system
 * preferences. Returns `true` if reduced motion is preferred, `false` otherwise.
 *
 * Scroll-effect components use this to gate animations, ensuring compliance with
 * WCAG 2.3.3 (Motion from Animation) and avoiding vestibular discomfort.
 *
 * @see https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions
 */
export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
    };

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
    // Legacy browsers
    // @ts-expect-error - addListener is deprecated but needed for older browsers
    mediaQuery.addListener(handleChange);
    // @ts-expect-error - removeListener is deprecated but needed for older browsers
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  return reducedMotion;
}
