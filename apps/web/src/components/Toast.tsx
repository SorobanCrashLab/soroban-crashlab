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
  type Toast,
  type ToastInput,
} from './toast-utils';

interface ToastContextValue {
  /** Show a toast. Returns its id so callers can dismiss it programmatically. */
  notify: (input: ToastInput) => string;
  /** Convenience helper for the common API-error case. */
  notifyError: (message: string) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastCounter = 0;
function nextToastId(): string {
  toastCounter += 1;
  return `toast-${Date.now()}-${toastCounter}`;
}

/**
 * Provides the toast API and renders the toast viewport.
 *
 * Fixes #841: every toast schedules an auto-dismiss timer (default
 * {@link DEFAULT_TOAST_DURATION} ≈ 5.5s) so error toasts no longer linger
 * forever. Timers pause while the pointer is over the stack and the close
 * button still allows immediate manual dismissal.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Track active timers so we can pause/clear them without leaking.
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((current) => removeToast(current, id));
  }, []);

  const scheduleDismiss = useCallback(
    (toast: Toast) => {
      if (!shouldAutoDismiss(toast)) return;
      const timer = setTimeout(() => dismiss(toast.id), toast.duration);
      timersRef.current.set(toast.id, timer);
    },
    [dismiss],
  );

  const notify = useCallback(
    (input: ToastInput) => {
      const toast = createToast(input, nextToastId());
      setToasts((current) => addToast(current, toast));
      scheduleDismiss(toast);
      return toast.id;
    },
    [scheduleDismiss],
  );

  const notifyError = useCallback(
    (message: string) => notify({ message, variant: 'error' }),
    [notify],
  );

  // Pause auto-dismiss while hovering so users can read longer messages.
  const pauseAll = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current.clear();
  }, []);

  const resumeAll = useCallback(() => {
    toasts.forEach((toast) => {
      if (!timersRef.current.has(toast.id)) scheduleDismiss(toast);
    });
  }, [toasts, scheduleDismiss]);

  // Clear any outstanding timers on unmount.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ notify, notifyError, dismiss }),
    [notify, notifyError, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[min(92vw,22rem)]"
        onMouseEnter={pauseAll}
        onMouseLeave={resumeAll}
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={() => dismiss(toast.id)} />
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

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  return (
    <div
      // Errors are assertive so screen readers announce them immediately;
      // other variants are polite.
      role={toast.variant === 'error' ? 'alert' : 'status'}
      aria-live={toast.variant === 'error' ? 'assertive' : 'polite'}
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg text-sm ${VARIANT_STYLES[toast.variant]}`}
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
