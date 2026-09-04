/**
 * Debounced, rAF-aligned resize measurement.
 *
 * Used by the widget grid editor to recompute cell metrics on container
 * resize without thrashing layout during resize storms.
 *
 * Behaviour:
 *  - The FIRST observed resize triggers a synchronous leading measurement so
 *    the initial paint never flashes with stale metrics.
 *  - Subsequent resizes within `debounceMs` are coalesced to a single
 *    TRAILING measurement, aligned to the next animation frame so layout has
 *    settled before we read geometry.
 *
 * All schedulers are injectable so unit tests can drive the event-count math
 * with a fake clock (see createMeasuredResizer.test.ts).
 */

export interface MeasuredResizerOptions {
  /** Trailing debounce window in ms. Default 100. */
  debounceMs?: number;
  /** setTimeout injector (for tests). */
  scheduleTimeout?: (fn: () => void, ms: number) => unknown;
  /** clearTimeout injector (for tests). */
  clearTimeout?: (handle: unknown) => void;
  /** requestAnimationFrame injector (for tests). */
  scheduleFrame?: (fn: () => void) => unknown;
  /** cancelAnimationFrame injector (for tests). */
  cancelFrame?: (handle: unknown) => void;
  /** ResizeObserver constructor injector (for tests). */
  ResizeObserver?: typeof ResizeObserver;
}

export interface MeasuredResizer {
  observe: (element: Element) => void;
  disconnect: () => void;
}

export function createMeasuredResizer(
  callback: () => void,
  options: MeasuredResizerOptions = {},
): MeasuredResizer {
  const debounceMs = options.debounceMs ?? 100;
  const scheduleTimeout =
    options.scheduleTimeout ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimeoutFn =
    options.clearTimeout ??
    ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const scheduleFrame =
    options.scheduleFrame ?? ((fn) => requestAnimationFrame(fn));
  const cancelFrame =
    options.cancelFrame ?? ((handle: unknown) => cancelAnimationFrame(handle as number));
  const RO: typeof ResizeObserver | undefined =
    options.ResizeObserver ??
    (typeof window !== 'undefined' ? window.ResizeObserver : undefined);

  let observer: ResizeObserver | null = null;
  let timer: unknown = null;
  let frame: unknown = null;
  let hasMeasuredInitial = false;

  const runCallback = (): void => {
    callback();
  };

  const scheduleTrailing = (): void => {
    if (timer != null) clearTimeoutFn(timer);
    timer = scheduleTimeout(() => {
      timer = null;
      // Align to a frame so layout is settled before measuring.
      frame = scheduleFrame(() => {
        frame = null;
        runCallback();
      });
    }, debounceMs);
  };

  const handleResize = (): void => {
    if (!hasMeasuredInitial) {
      // Leading synchronous initial measurement — no mount flash.
      hasMeasuredInitial = true;
      runCallback();
      return;
    }
    scheduleTrailing();
  };

  return {
    observe(element: Element): void {
      if (!RO) return;
      observer = new RO(() => handleResize());
      observer.observe(element);
    },
    disconnect(): void {
      if (timer != null) {
        clearTimeoutFn(timer);
        timer = null;
      }
      if (frame != null) {
        cancelFrame(frame);
        frame = null;
      }
      observer?.disconnect();
      observer = null;
    },
  };
}
