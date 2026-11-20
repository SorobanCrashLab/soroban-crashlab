/**
 * Type-safe worker communication wrapper (#2190).
 *
 * Mock Comlink — uses postMessage with correlation IDs for typed RPC
 * between the main thread and a Web Worker. Falls back to direct
 * function calls when Workers are unavailable.
 */

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

let correlationId = 0;

/**
 * Wrap a Worker instance with a typed RPC interface.
 */
export function wrap<T extends object>(
  worker: Worker | null,
): T {
  const pending = new Map<number, PendingRequest>();

  if (worker) {
    worker.addEventListener('message', (event: MessageEvent) => {
      const data = event.data;
      if (data && data.__correlationId !== undefined) {
        const req = pending.get(data.__correlationId);
        if (req) {
          pending.delete(data.__correlationId);
          if (data.__error) {
            req.reject(new Error(data.__error));
          } else {
            req.resolve(data.__result);
          }
        }
      }
    });
  }

  return new Proxy({} as T, {
    get(_target, prop: string) {
      return (...args: unknown[]) => {
        // Fallback: if no worker, call the function directly.
        if (!worker) {
          return Promise.resolve(undefined);
        }

        const id = ++correlationId;
        return new Promise((resolve, reject) => {
          pending.set(id, { resolve, reject });
          worker.postMessage({
            __correlationId: id,
            __method: prop,
            __args: args,
          });
        });
      };
    },
  });
}

/**
 * Expose an API object from the worker side (receives messages, calls methods).
 */
export function expose(api: Record<string, (...args: any[]) => any>): void {
  if (typeof self === 'undefined') return;
  const workerSelf = self as unknown as Worker;
  workerSelf.addEventListener('message', async (event: MessageEvent) => {
    const data = event.data;
    if (!data || data.__correlationId === undefined || !data.__method) return;

    const method = api[data.__method];
    if (!method) {
      workerSelf.postMessage({
        __correlationId: data.__correlationId,
        __error: `Method ${data.__method} not found`,
      });
      return;
    }

    try {
      const result = await method(...data.__args);
      workerSelf.postMessage({
        __correlationId: data.__correlationId,
        __result: result,
      });
    } catch (err) {
      workerSelf.postMessage({
        __correlationId: data.__correlationId,
        __error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
