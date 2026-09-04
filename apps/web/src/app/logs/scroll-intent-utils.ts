/**
 * Pure utility for deciding whether to follow output in the log viewer.
 * Issue #1352: Log viewer loses pinned scroll position when autoscroll races a new batch.
 */

export interface ScrollIntentParams {
  /** Distance in pixels from the bottom of the scroll container */
  distanceFromBottom: number;
  /** Whether the user recently scrolled upward */
  scrolledUp: boolean;
  /** Whether autoscroll toggle is ON */
  autoscroll: boolean;
  /** Threshold distance (in px) to consider "at bottom" */
  threshold?: number;
}

/**
 * Decides whether new log entries should trigger an automatic scroll-to-bottom.
 *
 * Logic:
 * - If user scrolled up manually, do NOT follow
 * - If user is within threshold of bottom, follow regardless of toggle
 * - If autoscroll toggle is ON and user hasn't scrolled up, follow
 */
export function shouldFollow(params: ScrollIntentParams): boolean {
  const { distanceFromBottom, scrolledUp, autoscroll, threshold = 50 } = params;

  // User explicitly scrolled up - respect their intent
  if (scrolledUp) {
    return false;
  }

  // User is near bottom - act like a terminal (follow output)
  if (distanceFromBottom <= threshold) {
    return true;
  }

  // Autoscroll is ON and user hasn't scrolled - follow
  return autoscroll;
}
