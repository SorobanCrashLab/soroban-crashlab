/**
 * @deprecated Use `useToast` from `@/components/Toast` instead.
 * This hook-based implementation is superseded by the canonical toast system
 * in `components/Toast.tsx` which includes pause/resume timers, proper
 * auto-dismiss countdowns, and fix for #841 / #1075.
 */
'use client';

import { useCallback, useContext, createContext, useState, ReactNode } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (message: string, type: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

export function useToastActions() {
  const { showToast } = useToast();

  return {
    success: (message: string, duration?: number) => showToast(message, 'success', duration ?? 3000),
    error: (message: string, duration?: number) => showToast(message, 'error', duration ?? 5000),
    info: (message: string, duration?: number) => showToast(message, 'info', duration ?? 3000),
    warning: (message: string, duration?: number) => showToast(message, 'warning', duration ?? 4000),
  };
}

interface ToastProviderProps {
  children: ReactNode;
  maxToasts?: number;
}

export function ToastProvider({ children, maxToasts = 5 }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback(
    (message: string, type: ToastType, duration: number = 3000) => {
      const id = Date.now().toString();
      const newToast: Toast = { id, type, message, duration };

      setToasts((prev) => {
        const updated = [...prev, newToast];
        if (updated.length > maxToasts) {
          return updated.slice(-maxToasts);
        }
        return updated;
      });
    },
    [maxToasts],
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  const value: ToastContextType = {
    toasts,
    showToast,
    removeToast,
    clearAll,
  };

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}
