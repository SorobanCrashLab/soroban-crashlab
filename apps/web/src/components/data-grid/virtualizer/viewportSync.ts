/**
 * Scroll/resize synchronization for the data grid (#2190).
 *
 * Tracks scroll position (scrollTop, scrollLeft) and viewport size changes
 * using ResizeObserver. Scroll events are throttled with requestAnimationFrame
 * to avoid excessive state updates.
 */

interface ViewportSyncCallbacks {
  onScroll?: (scrollTop: number, scrollLeft: number) => void;
  onResize?: (width: number, height: number) => void;
}

export class ViewportSync {
  private element: HTMLElement | null = null;
  private callbacks: ViewportSyncCallbacks;
  private scrollFrame: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private scrollTop = 0;
  private scrollLeft = 0;
  private width = 0;
  private height = 0;

  constructor(callbacks: ViewportSyncCallbacks = {}) {
    this.callbacks = callbacks;
  }

  attach(element: HTMLElement): void {
    this.element = element;
    this.measureViewport();

    element.addEventListener('scroll', this.handleScroll, { passive: true });

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.measureViewport();
        this.callbacks.onResize?.(this.width, this.height);
      });
      this.resizeObserver.observe(element);
    }
  }

  detach(): void {
    if (this.element) {
      this.element.removeEventListener('scroll', this.handleScroll);
      this.element = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.scrollFrame !== null) {
      cancelAnimationFrame(this.scrollFrame);
      this.scrollFrame = null;
    }
  }

  private handleScroll = (): void => {
    if (this.scrollFrame !== null) return;
    this.scrollFrame = requestAnimationFrame(() => {
      this.scrollFrame = null;
      const el = this.element;
      if (!el) return;
      this.scrollTop = el.scrollTop;
      this.scrollLeft = el.scrollLeft;
      this.callbacks.onScroll?.(this.scrollTop, this.scrollLeft);
    });
  };

  private measureViewport(): void {
    if (!this.element) return;
    const rect = this.element.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
  }

  getScrollTop(): number {
    return this.scrollTop;
  }

  getScrollLeft(): number {
    return this.scrollLeft;
  }

  getSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  scrollTo(top: number, left?: number): void {
    if (this.element) {
      this.element.scrollTop = top;
      if (left !== undefined) {
        this.element.scrollLeft = left;
      }
    }
  }
}

export function createViewportSync(callbacks?: ViewportSyncCallbacks): ViewportSync {
  return new ViewportSync(callbacks);
}
