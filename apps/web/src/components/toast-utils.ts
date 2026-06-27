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
