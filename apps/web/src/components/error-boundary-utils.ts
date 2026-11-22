/**
 * Pure state helpers for {@link ErrorBoundary}.
 *
 * Keeping the state transitions in a standalone, side-effect-free module makes
 * the "reset on retry" behaviour (issue #839) directly unit-testable without a
 * DOM/React renderer, matching the repo's tsc + node test convention.
 */

export interface ErrorBoundaryState {
  /** Whether the boundary is currently showing its fallback UI. */
  hasError: boolean;
  /** The error that was caught, or null once the boundary is healthy. */
  error: Error | null;
}

/** The state a healthy boundary starts in (and returns to after a retry). */
export const initialErrorState: ErrorBoundaryState = {
  hasError: false,
  error: null,
};

/**
 * Derive the error state from a thrown value. Mirrors what
 * `getDerivedStateFromError` should return so the fallback renders.
 */
export function errorStateFromError(error: Error): ErrorBoundaryState {
  return { hasError: true, error };
}

/**
 * Produce the state used when the user clicks "Retry".
 *
 * The bug in #839 was that retrying did not clear the captured error, so the
 * fallback kept rendering even though `reset` was called. Returning a fresh
 * {@link initialErrorState} guarantees `hasError` is cleared and the children
 * are re-rendered on the next pass.
 */
export function resetErrorState(): ErrorBoundaryState {
  return { ...initialErrorState };
}

/**
 * Determine whether a boundary should auto-reset because its `resetKeys`
 * changed (e.g. the route/id the boundary depends on changed). This lets a
 * boundary recover automatically without the user clicking "Retry".
 *
 * Returns false when either list is missing or lengths differ in a way that
 * makes comparison meaningless, so callers fall back to manual retry.
 */
export function haveResetKeysChanged(
  prevKeys: readonly unknown[] | undefined,
  nextKeys: readonly unknown[] | undefined,
): boolean {
  if (!prevKeys || !nextKeys) return false;
  if (prevKeys.length !== nextKeys.length) return true;
  return prevKeys.some((key, index) => !Object.is(key, nextKeys[index]));
}
