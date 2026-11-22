/**
 * Pure data helpers for the toast system.
 *
 * The auto-dismiss timing and the add/remove reducer live here (side-effect
 * free) so the #841 behaviour — "error toasts disappear automatically after a
 * few seconds while still being manually closable" — is unit-testable with the
 * repo's tsc + node harness.
 */

export type ToastVariant = 'error' | 'success' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  /**
   * Milliseconds before the toast auto-dismisses. `0` (or any non-positive
   * value) disables auto-dismiss so the toast must be closed manually.
   */
  duration: number;
}

export interface ToastInput {
  message: string;
  variant?: ToastVariant;
  duration?: number;
}

/**
 * Default lifetime for a toast. The #841 acceptance criteria call for error
 * toasts to vanish after ~5–6 seconds; 5500ms sits in that window and gives a
 * reader enough time to scan the message.
 */
export const DEFAULT_TOAST_DURATION = 5500;

/** Whether a toast should schedule an auto-dismiss timer. */
export function shouldAutoDismiss(toast: Pick<Toast, 'duration'>): boolean {
  return Number.isFinite(toast.duration) && toast.duration > 0;
}

/** Build a fully-formed toast from caller input, applying defaults. */
export function createToast(input: ToastInput, id: string): Toast {
  return {
    id,
    message: input.message,
    variant: input.variant ?? 'info',
    duration: input.duration ?? DEFAULT_TOAST_DURATION,
  };
}

/** Append a toast (immutably). */
export function addToast(toasts: readonly Toast[], toast: Toast): Toast[] {
  return [...toasts, toast];
}

/** Remove a toast by id (immutably) — used by both auto-dismiss and the close button. */
export function removeToast(toasts: readonly Toast[], id: string): Toast[] {
  return toasts.filter((toast) => toast.id !== id);
}

// ── Pause / resume bookkeeping (#1075) ───────────────────────────────────────
//
// Hovering the toast stack used to clear every pending timer and then restart a
// *full* duration on mouse-leave, so a toast the pointer had merely drifted over
// never dismissed on schedule — and if the leave event never arrived (the stack
// shrinks out from under the cursor when a toast closes) the timer was dropped
// entirely and the toast stayed on screen forever. Tracking the remaining time
// makes pause/resume resume, rather than restart.

/** A toast's countdown: what is left to run, and when it last started running. */
export interface ToastTimerState {
  /** Milliseconds still to elapse before dismissal. */
  remaining: number;
  /**
   * Epoch millis when this stretch of the countdown began, or `null` while
   * paused (the countdown is frozen and `remaining` is authoritative).
   */
  resumedAt: number | null;
}

/** Fresh countdown for a toast that is about to start running at `now`. */
export function startTimerState(toast: Pick<Toast, 'duration'>, now: number): ToastTimerState {
  return { remaining: toast.duration, resumedAt: now };
}

/**
 * Freeze a countdown, deducting the time that has run since it resumed.
 * Pausing an already-paused countdown is a no-op, so repeated `mouseenter`
 * events (React fires one per nested element boundary) can't inflate the total.
 */
export function pauseTimerState(state: ToastTimerState, now: number): ToastTimerState {
  if (state.resumedAt === null) return state;
  const elapsed = Math.max(0, now - state.resumedAt);
  return { remaining: Math.max(0, state.remaining - elapsed), resumedAt: null };
}

/** Restart a frozen countdown from wherever it left off. */
export function resumeTimerState(state: ToastTimerState, now: number): ToastTimerState {
  if (state.resumedAt !== null) return state;
  return { remaining: state.remaining, resumedAt: now };
}

/**
 * Delay to hand to `setTimeout` for a countdown.
 *
 * Clamped to a small positive floor so a countdown that expired while paused
 * still dismisses promptly instead of scheduling a `0`/negative timeout that
 * could fire inside the same event that resumed it.
 */
export const MIN_RESUME_DELAY = 16;

export function timerDelay(state: ToastTimerState): number {
  return Math.max(MIN_RESUME_DELAY, state.remaining);
}
