'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { InspectorCommand, InspectorResponse } from '../workers/protocol';
interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
export function useXdrInspector() {
  const worker = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, Pending>());
  const sequence = useRef(0);
  const [busy, setBusy] = useState(false);
  const stop = useCallback((message = 'Inspection cancelled; reload the payload to continue') => {
    worker.current?.terminate();
    worker.current = null;
    for (const job of pending.current.values()) {
      clearTimeout(job.timer);
      job.reject(new Error(message));
    }
    pending.current.clear();
    setBusy(false);
  }, []);
  const request = useCallback(
    <T>(command: InspectorCommand): Promise<T> => {
      if (!worker.current) {
        if (typeof Worker === 'undefined')
          return Promise.reject(
            new Error('This browser requires Web Worker support for safe XDR inspection'),
          );
        try {
          const instance = new Worker(new URL('../workers/decodeWorker.ts', import.meta.url), {
            type: 'module',
          });
          instance.onmessage = (event: MessageEvent<InspectorResponse>) => {
            const response = event.data;
            const job = pending.current.get(response.id);
            if (!job) return;
            clearTimeout(job.timer);
            pending.current.delete(response.id);
            setBusy(pending.current.size > 0);
            if (response.ok) job.resolve(response.value);
            else job.reject(new Error(response.error ?? 'Worker operation failed'));
          };
          instance.onerror = () => stop('Inspector worker failed to load; reload the payload');
          instance.onmessageerror = () => stop('Inspector worker returned an unreadable message');
          worker.current = instance;
        } catch {
          return Promise.reject(
            new Error('Cannot start the inspector worker under this browser policy'),
          );
        }
      }
      const id = ++sequence.current;
      setBusy(true);
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(
          () =>
            stop(
              'Inspection timed out; worker terminated. Reload a smaller or less deeply nested payload.',
            ),
          30000,
        );
        pending.current.set(id, { resolve: (value) => resolve(value as T), reject, timer });
        try {
          worker.current!.postMessage({ id, command });
        } catch {
          stop('Unable to send this payload to the inspector worker');
        }
      });
    },
    [stop],
  );
  useEffect(
    () => () => {
      worker.current?.terminate();
      for (const job of pending.current.values()) {
        clearTimeout(job.timer);
        job.reject(new Error('Inspector closed'));
      }
      pending.current.clear();
    },
    [],
  );
  return { request, busy, cancel: () => stop() };
}
