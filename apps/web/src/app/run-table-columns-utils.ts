/**
 * Responsive run-table column visibility.
 *
 * The fuzzing runs table exposes several optional columns. On narrow
 * viewports — phones and portrait tablets — rendering every column pushes the
 * table off-screen or forces heavy horizontal scrolling, which hurts
 * scanability and makes it easy to misread rows. These utilities classify a
 * viewport width into a breakpoint and, on smaller breakpoints, hide the least
 * important columns first so the table stays legible without losing context.
 */

export type RunTableBreakpoint = 'desktop' | 'tablet' | 'mobile';

export const RUN_TABLE_BREAKPOINTS: RunTableBreakpoint[] = [
  'desktop',
  'tablet',
  'mobile',
];

/**
 * Display importance of each run-table column. A lower tier is more important
 * and is therefore kept on more breakpoints. Columns not listed here are
 * treated as tier `UNKNOWN_COLUMN_TIER` (kept on every breakpoint) so an
 * unrecognised column id is never silently dropped.
 */
export const RUN_COLUMN_TIER: Record<string, number> = {
  id: 1,
  status: 1,
  duration: 2,
  report: 3,
  area: 4,
  severity: 4,
  seedCount: 5,
};

/** Unknown columns (not defined above) always stay visible. */
const UNKNOWN_COLUMN_TIER = 1;

/**
 * The highest (least important) tier that remains visible at each breakpoint.
 * - desktop  (>=1024px): every column.
 * - tablet   (768-1023px, portrait tablet): drop only `seedCount`.
 * - mobile   (<768px): keep only the essentials (`id`, `status`, `duration`).
 */
const MAX_VISIBLE_TIER: Record<RunTableBreakpoint, number> = {
  desktop: 5,
  tablet: 4,
  mobile: 2,
};

/**
 * Maps a viewport width to a breakpoint.
 *
 * Tablet portrait is treated as its own breakpoint (768–1023px) so the table
 * can shed just the least valuable columns there while desktop keeps the full
 * set and phones fall back to the most essential columns.
 */
export function getViewportBreakpoint(width: number): RunTableBreakpoint {
  if (width >= 1024) {
    return 'desktop';
  }
  if (width >= 768) {
    return 'tablet';
  }
  return 'mobile';
}

/**
 * Filters the base column list down to the columns that should be visible at
 * the given breakpoint. Column order is preserved from the input.
 */
export function getResponsiveRunColumns(
  baseColumns: string[],
  breakpoint: RunTableBreakpoint,
): string[] {
  const maxTier = MAX_VISIBLE_TIER[breakpoint];
  return baseColumns.filter(
    (col) => (RUN_COLUMN_TIER[col] ?? UNKNOWN_COLUMN_TIER) <= maxTier,
  );
}