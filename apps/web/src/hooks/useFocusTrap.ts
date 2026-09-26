import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
].join(',');

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const elements = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return elements.filter((el) => {
    if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') {
      return false;
    }
    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }
    }
    return true;
  });
}

export interface UseFocusTrapOptions {
  containerRef?: RefObject<HTMLElement | null>;
  triggerRef?: RefObject<HTMLElement | null> | null;
  active?: boolean;
  onClose?: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
  closeOnEscape?: boolean;
  restoreFocus?: boolean;
  preventScroll?: boolean;
  role?: 'dialog' | 'alertdialog';
  ariaModal?: boolean;
}

/**
 * Traps keyboard focus within the provided container while active.
 * - On Tab / Shift+Tab focus cycles forward/backward, wrapping at the ends.
 * - Pressing Escape invokes `onClose` (caller-optional via `closeOnEscape`).
 * - On activation focus moves to `initialFocusRef` or the first focusable element.
 * - On deactivation (or unmount) focus returns to `triggerRef` or invoking element.
 * - Configures aria-modal and role attributes if not already present.
 * - Prevents background body scrolling while active (caller-optional via `preventScroll`).
 */
export function useFocusTrap(options: UseFocusTrapOptions): void;
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  triggerRef?: RefObject<HTMLElement | null> | null,
  active?: boolean,
  onClose?: () => void,
  options?: Partial<UseFocusTrapOptions>,
): void;
export function useFocusTrap(
  containerRefOrOptions: RefObject<HTMLElement | null> | UseFocusTrapOptions,
  triggerRefArg?: RefObject<HTMLElement | null> | null,
  activeArg?: boolean,
  onCloseArg?: () => void,
  optionsArg?: Partial<UseFocusTrapOptions>,
): void {
  const isOptionsObject =
    containerRefOrOptions !== null &&
    typeof containerRefOrOptions === 'object' &&
    !('current' in containerRefOrOptions);

  const options: UseFocusTrapOptions = isOptionsObject
    ? (containerRefOrOptions as UseFocusTrapOptions)
    : {
        containerRef: containerRefOrOptions as RefObject<HTMLElement | null>,
        triggerRef: triggerRefArg,
        active: activeArg ?? false,
        onClose: onCloseArg,
        ...optionsArg,
      };

  const {
    containerRef,
    triggerRef,
    active = false,
    onClose,
    initialFocusRef,
    closeOnEscape = Boolean(onClose),
    restoreFocus = true,
    preventScroll = true,
    role = 'dialog',
    ariaModal = true,
  } = options;

  const savedTriggerRef = useRef<HTMLElement | null>(null);

  // Capture trigger element before opening and restore when closing
  useEffect(() => {
    if (active) {
      if (triggerRef?.current) {
        savedTriggerRef.current = triggerRef.current;
      } else if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
        savedTriggerRef.current = document.activeElement;
      }
    } else if (savedTriggerRef.current && restoreFocus) {
      const el = triggerRef?.current ?? savedTriggerRef.current;
      savedTriggerRef.current = null;
      if (el && typeof el.focus === 'function' && document.activeElement !== el) {
        el.focus();
      }
    }
  }, [active, triggerRef, restoreFocus]);

  // Restore on unmount if unmounted while active
  useEffect(() => {
    const triggerEl = triggerRef?.current;
    return () => {
      if (active && restoreFocus) {
        const el = triggerEl ?? savedTriggerRef.current;
        if (el && typeof el.focus === 'function' && document.activeElement !== el) {
          el.focus();
        }
      }
    };
  }, [active, triggerRef, restoreFocus]);

  // Lock body scroll while active
  useEffect(() => {
    if (!active || !preventScroll || typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [active, preventScroll]);

  // Wire up role and aria-modal on container if not already set
  useEffect(() => {
    const container = containerRef?.current;
    if (!active || !container) return;

    const addedRole = !container.hasAttribute('role');
    if (addedRole && role) {
      container.setAttribute('role', role);
    }

    const addedAriaModal = !container.hasAttribute('aria-modal');
    if (addedAriaModal && ariaModal) {
      container.setAttribute('aria-modal', 'true');
    }

    return () => {
      if (addedRole) container.removeAttribute('role');
      if (addedAriaModal) container.removeAttribute('aria-modal');
    };
  }, [active, containerRef, role, ariaModal]);

  // Move initial focus and trap keyboard events
  useEffect(() => {
    const container = containerRef?.current;
    if (!active || !container) return;

    const focusInitialTarget = () => {
      if (initialFocusRef?.current && container.contains(initialFocusRef.current)) {
        initialFocusRef.current.focus();
        return;
      }

      const focusable = getFocusableElements(container);
      if (focusable.length > 0) {
        if (!container.contains(document.activeElement)) {
          focusable[0].focus();
        }
      } else {
        if (!container.hasAttribute('tabindex')) {
          container.setAttribute('tabindex', '-1');
        }
        container.focus();
      }
    };

    focusInitialTarget();

    // Use a microtask/raf fallback in case elements are still rendering into the container
    const rafId = requestAnimationFrame(() => {
      if (container && !container.contains(document.activeElement)) {
        focusInitialTarget();
      }
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      if (event.key === 'Escape') {
        if (closeOnEscape && onClose) {
          event.preventDefault();
          onClose();
        }
        return;
      }

      if (event.key !== 'Tab') return;

      const elements = getFocusableElements(container);
      if (elements.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = elements[0];
      const last = elements[elements.length - 1];
      const current = document.activeElement;

      if (!container.contains(current)) {
        event.preventDefault();
        if (event.shiftKey) {
          last.focus();
        } else {
          first.focus();
        }
        return;
      }

      if (event.shiftKey) {
        if (current === first) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (current === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [active, containerRef, initialFocusRef, closeOnEscape, onClose]);
}
