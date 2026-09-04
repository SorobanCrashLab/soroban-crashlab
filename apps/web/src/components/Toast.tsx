'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  shouldAutoDismiss,
  createToast,
  addToast,
  removeToast,
  startTimerState,
  pauseTimerState,
  resumeTimerState,
  timerDelay,
  type Toast,
  type ToastInput,
  type ToastTimerState,
} from './toast-utils';

import { toUserMessage } from '../lib/api-error-mapper';

interface ToastContextValue {
  /** Show a toast. Returns its id so callers can dismiss it programmatically. */
  notify: (input: ToastInput) => string;
  /** Convenience helper for the common API-error case. */
  notifyError: (error: unknown) => string;
  /** Convenience helper for the common success case. */
  notifySuccess: (message: string) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastCounter = 0;
function nextToastId(): string {
  toastCounter += 1;
  return `toast-${Date.now()}-${toastCounter}`;
}

/** A running countdown plus the `setTimeout` handle currently backing it. */
interface ActiveTimer extends ToastTimerState {
  handle: ReturnType<typeof setTimeout> | null;
}

/**
 * Provides the toast API and renders the toast viewport.
 *
 * Fixes #841: every toast schedules an auto-dismiss timer (default
 * {@link DEFAULT_TOAST_DURATION} ≈ 5.5s) so error toasts no longer linger
 * forever. Timers pause while the pointer is over the stack and the close
 * button still allows immediate manual dismissal.
 *
 * Fixes #1075: hovering used to clear every timer and then restart a *full*
 * duration, so an error toast the pointer drifted over never dismissed on
 * schedule — and a missed `mouseleave` dropped the timer for good. Countdowns
 * now carry their remaining time, pause per-toast rather than stack-wide, and
 * the viewport no longer swallows pointer events when it is empty.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Countdown state per toast, so we can pause/resume/clear without leaking.
  const timersRef = useRef<Map<string, ActiveTimer>>(new Map());

  const clearHandle = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer?.handle) clearTimeout(timer.handle);
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearHandle(id);
      timersRef.current.delete(id);
      setToasts((current) => removeToast(current, id));
    },
    [clearHandle],
  );

  /** Arm (or re-arm) the `setTimeout` backing an already-recorded countdown. */
  const arm = useCallback(
    (id: string, state: ToastTimerState) => {
      clearHandle(id);
      const handle = setTimeout(() => dismiss(id), timerDelay(state));
      timersRef.current.set(id, { ...state, handle });
    },
    [clearHandle, dismiss],
  );

  const notify = useCallback(
    (input: ToastInput) => {
      const toast = createToast(input, nextToastId());
      setToasts((current) => addToast(current, toast));
      if (shouldAutoDismiss(toast)) {
        arm(toast.id, startTimerState(toast, Date.now()));
      }
      return toast.id;
    },
    [arm],
  );

  const notifyError = useCallback(
    (error: unknown) => {
      console.error(error);
      const userMsg = toUserMessage(error);
      return notify({ message: userMsg, variant: 'error' });
    },
    [notify],
  );

  const notifySuccess = useCallback(
    (message: string) => notify({ message, variant: 'success' }),
    [notify],
  );

  // Pause auto-dismiss while the pointer/focus is on a toast so users can read
  // longer messages. Scoped to the one toast being read — hovering a single
  // error no longer freezes the rest of the stack indefinitely.
  const pause = useCallback(
    (id: string) => {
      const timer = timersRef.current.get(id);
      if (!timer || timer.resumedAt === null) return;
      if (timer.handle) clearTimeout(timer.handle);
      timersRef.current.set(id, { ...pauseTimerState(timer, Date.now()), handle: null });
    },
    [],
  );

  const resume = useCallback(
    (id: string) => {
      const timer = timersRef.current.get(id);
      if (!timer || timer.resumedAt !== null) return;
      arm(id, resumeTimerState(timer, Date.now()));
    },
    [arm],
  );

  // Safety net: a tab switch or a toast closing under the cursor can swallow the
  // `mouseleave` that would normally resume the countdown. Re-arm anything still
  // paused once the page is interactive again so nothing is stranded on screen.
  useEffect(() => {
    const resumeStranded = () => {
      if (document.visibilityState !== 'visible') return;
      timersRef.current.forEach((timer, id) => {
        if (timer.resumedAt === null) arm(id, resumeTimerState(timer, Date.now()));
      });
    };
    document.addEventListener('visibilitychange', resumeStranded);
    return () => document.removeEventListener('visibilitychange', resumeStranded);
  }, [arm]);

  // Clear any outstanding timers on unmount.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => {
        if (timer.handle) clearTimeout(timer.handle);
      });
      timers.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ notify, notifyError, notifySuccess, dismiss }),
    [notify, notifyError, notifySuccess, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/*
        `pointer-events-none` keeps this always-mounted fixed overlay from
        capturing hovers meant for the page underneath — which previously paused
        every toast timer without the user ever touching a toast. Individual
        toasts opt back in.
      */}
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-50 flex flex-col gap-2 w-auto sm:w-[min(92vw,24rem)] pointer-events-none">
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onClose={() => dismiss(toast.id)}
            onPause={() => pause(toast.id)}
            onResume={() => resume(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const VARIANT_STYLES: Record<Toast['variant'], string> = {
  error: 'border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200',
  success:
    'border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-200',
  warning:
    'border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200',
  info: 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200',
};

function ToastItem({
  toast,
  onClose,
  onPause,
  onResume,
}: {
  toast: Toast;
  onClose: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  return (
    <div
      // Errors are assertive so screen readers announce them immediately;
      // other variants are polite.
      role={toast.variant === 'error' ? 'alert' : 'status'}
      aria-live={toast.variant === 'error' ? 'assertive' : 'polite'}
      // Hover *and* keyboard focus hold the countdown, so a toast can't vanish
      // mid-read or while the close button is being tabbed to.
      onMouseEnter={onPause}
      onMouseLeave={onResume}
      onFocus={onPause}
      onBlur={onResume}
      className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg text-sm ${VARIANT_STYLES[toast.variant]}`}
    >
      <span className="flex-1 break-words">{toast.message}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss notification"
        className="shrink-0 rounded-md p-0.5 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-current transition-opacity"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

/** Access the toast API. Must be used within a {@link ToastProvider}. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a <ToastProvider>');
  }
  return ctx;
}

export default ToastProvider;
