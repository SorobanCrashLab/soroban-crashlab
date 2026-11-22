/**
 * Container-query-driven responsive columns for widget grid (#1404)
 * Mirrors viewport breakpoints via container width tiers so sidebar-collapse
 * triggers reflow without viewport change. @supports fallback preserves
 * legacy viewport-class behavior.
 */

export const CONTAINER_TIERS = [
  { min: 0, cols: 1 },
  { min: 640, cols: 2 },
  { min: 768, cols: 3 },
  { min: 1024, cols: 4 },
  { min: 1280, cols: 6 },
] as const;

export function getColumnCountForWidth(width: number): number {
  let cols = 1;
  for (const tier of CONTAINER_TIERS) {
    if (width >= tier.min) cols = tier.cols;
  }
  return cols;
}

export function getTierForWidth(width: number): number {
  return getColumnCountForWidth(width);
}

/**
 * Clamp persisted layout positions to be within tier column count.
 * Saved six-column layout loaded into three-column tier heals legally.
 */
export function clampLayoutForTier<T extends { position: { x: number; y: number } }>(
  widgets: T[],
  cols: number,
): T[] {
  return widgets.map((w) => {
    const maxX = Math.max(0, cols - 1);
    const clampedX = Math.min(Math.max(0, w.position.x), maxX);
    // clamp y not needed for tier, but ensure non-negative
    const clampedY = Math.max(0, w.position.y);
    if (clampedX === w.position.x && clampedY === w.position.y) return w;
    return { ...w, position: { x: clampedX, y: clampedY } };
  });
}

export function isContainerQuerySupported(): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return false;
  return CSS.supports('container-type', 'inline-size');
}
