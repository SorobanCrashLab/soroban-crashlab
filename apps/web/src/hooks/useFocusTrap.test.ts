import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getFocusableElements, useFocusTrap, type UseFocusTrapOptions } from './useFocusTrap';
import type { RefObject } from 'react';

// Track hook cleanups across renders
let currentCleanups: Array<() => void> = [];

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useRef: (init: any) => ({ current: init }),
    useEffect: (callback: () => void | (() => void)) => {
      const cleanup = callback();
      if (typeof cleanup === 'function') {
        currentCleanups.push(cleanup);
      }
    },
  };
});

// Lightweight in-memory DOM mock for node environment
class MockNode {
  parentNode: MockNode | null = null;
  children: MockElement[] = [];

  appendChild(child: MockElement) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child: MockElement) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  contains(other: MockNode | null): boolean {
    if (!other) return false;
    if (other === this) return true;
    let curr = other.parentNode;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentNode;
    }
    return false;
  }
}

class MockElement extends MockNode {
  tagName: string;
  id: string = '';
  attributes: Record<string, string> = {};
  style: Record<string, string> = {};
  tabIndex: number = 0;

  constructor(tagName: string) {
    super();
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string) {
    this.attributes[name.toLowerCase()] = String(value);
    if (name.toLowerCase() === 'tabindex') {
      this.tabIndex = parseInt(value, 10);
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes[name.toLowerCase()] ?? null;
  }

  hasAttribute(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.attributes, name.toLowerCase());
  }

  removeAttribute(name: string) {
    delete this.attributes[name.toLowerCase()];
  }

  focus() {
    mockDocument.activeElement = this;
  }

  querySelectorAll<T = MockElement>(selector: string): T[] {
    const results: MockElement[] = [];
    const walk = (node: MockNode) => {
      for (const child of node.children) {
        if (matchesSelector(child, selector)) {
          results.push(child);
        }
        walk(child);
      }
    };
    walk(this);
    return results as unknown as T[];
  }
}

function matchesSelector(el: MockElement, selector: string): boolean {
  const parts = selector.split(',').map((s) => s.trim());
  return parts.some((part) => {
    if (part === 'button:not([disabled])') {
      return el.tagName === 'BUTTON' && !el.hasAttribute('disabled');
    }
    if (part === 'input:not([disabled])') {
      return el.tagName === 'INPUT' && !el.hasAttribute('disabled');
    }
    if (part === 'a[href]') {
      return el.tagName === 'A' && el.hasAttribute('href');
    }
    if (part === '[tabindex]:not([tabindex="-1"])') {
      return el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1';
    }
    return false;
  });
}

class MockKeyboardEvent {
  key: string;
  shiftKey: boolean;
  defaultPrevented = false;

  constructor(
    public type: string,
    init?: { key?: string; shiftKey?: boolean },
  ) {
    this.key = init?.key ?? '';
    this.shiftKey = init?.shiftKey ?? false;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }
}

let listeners: Record<string, ((event: any) => void)[]> = {};

const mockDocument = {
  activeElement: null as MockElement | null,
  body: new MockElement('BODY'),
  createElement(tag: string) {
    return new MockElement(tag);
  },
  addEventListener(event: string, fn: (e: any) => void) {
    listeners[event] = listeners[event] || [];
    listeners[event].push(fn);
  },
  removeEventListener(event: string, fn: (e: any) => void) {
    if (listeners[event]) {
      listeners[event] = listeners[event].filter((l) => l !== fn);
    }
  },
  dispatchEvent(event: any) {
    const list = listeners[event.type] || [];
    for (const fn of list) {
      fn(event);
    }
    return !event.defaultPrevented;
  },
};

// Install mocks into global scope for test duration
beforeEach(() => {
  listeners = {};
  currentCleanups = [];
  mockDocument.activeElement = null;
  mockDocument.body = new MockElement('BODY');
  mockDocument.body.style = { overflow: '' };
  (global as any).document = mockDocument;
  (global as any).HTMLElement = MockElement;
  (global as any).KeyboardEvent = MockKeyboardEvent;
  (global as any).requestAnimationFrame = (cb: () => void) => {
    cb();
    return 1;
  };
  (global as any).cancelAnimationFrame = () => {};
  (global as any).window = {
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
  };
});

afterEach(() => {
  currentCleanups.forEach((c) => c());
  currentCleanups = [];
});

function runHook(options: UseFocusTrapOptions) {
  // Run prior cleanups
  currentCleanups.forEach((c) => c());
  currentCleanups = [];
  useFocusTrap(options);
}

function unmountHook() {
  currentCleanups.forEach((c) => c());
  currentCleanups = [];
}

describe('useFocusTrap - getFocusableElements', () => {
  let container: MockElement;

  beforeEach(() => {
    container = new MockElement('DIV');
    mockDocument.body.appendChild(container);
  });

  afterEach(() => {
    mockDocument.body.removeChild(container);
  });

  it('collects interactive elements and filters out disabled / hidden elements', () => {
    const btn1 = new MockElement('BUTTON');
    btn1.id = 'btn1';
    const input1 = new MockElement('INPUT');
    input1.id = 'input1';
    const btnDisabled = new MockElement('BUTTON');
    btnDisabled.id = 'btn-disabled';
    btnDisabled.setAttribute('disabled', '');
    const link1 = new MockElement('A');
    link1.id = 'link1';
    link1.setAttribute('href', 'https://example.com');
    const tabEl = new MockElement('DIV');
    tabEl.id = 'tabindex-elem';
    tabEl.setAttribute('tabindex', '0');
    const tabNeg = new MockElement('DIV');
    tabNeg.id = 'tabindex-neg';
    tabNeg.setAttribute('tabindex', '-1');
    const btnAriaHidden = new MockElement('BUTTON');
    btnAriaHidden.id = 'btn-aria-hidden';
    btnAriaHidden.setAttribute('aria-hidden', 'true');

    container.appendChild(btn1);
    container.appendChild(input1);
    container.appendChild(btnDisabled);
    container.appendChild(link1);
    container.appendChild(tabEl);
    container.appendChild(tabNeg);
    container.appendChild(btnAriaHidden);

    const focusable = getFocusableElements(container as unknown as HTMLElement);
    const ids = focusable.map((el) => (el as unknown as MockElement).id);

    expect(ids).toEqual(['btn1', 'input1', 'link1', 'tabindex-elem']);
  });
});

describe('useFocusTrap - Hook Lifecycle & Interactions', () => {
  let container: MockElement;
  let trigger: MockElement;
  let btnFirst: MockElement;
  let btnMiddle: MockElement;
  let btnLast: MockElement;

  beforeEach(() => {
    trigger = new MockElement('BUTTON');
    trigger.id = 'trigger-btn';
    mockDocument.body.appendChild(trigger);
    trigger.focus();

    container = new MockElement('DIV');
    container.id = 'dialog-container';

    btnFirst = new MockElement('BUTTON');
    btnFirst.id = 'btn-first';
    btnMiddle = new MockElement('BUTTON');
    btnMiddle.id = 'btn-middle';
    btnLast = new MockElement('BUTTON');
    btnLast.id = 'btn-last';

    container.appendChild(btnFirst);
    container.appendChild(btnMiddle);
    container.appendChild(btnLast);
    mockDocument.body.appendChild(container);
  });

  afterEach(() => {
    if (container.parentNode) mockDocument.body.removeChild(container);
    if (trigger.parentNode) mockDocument.body.removeChild(trigger);
    mockDocument.body.style.overflow = '';
  });

  it('sets initial focus to first focusable element and configures aria-modal / role', () => {
    const containerRef: RefObject<HTMLElement | null> = { current: container as unknown as HTMLElement };
    const triggerRef: RefObject<HTMLElement | null> = { current: trigger as unknown as HTMLElement };
    const onClose = vi.fn();

    runHook({
      containerRef,
      triggerRef,
      active: true,
      onClose,
      role: 'alertdialog',
    });

    expect(container.getAttribute('role')).toBe('alertdialog');
    expect(container.getAttribute('aria-modal')).toBe('true');
    expect(mockDocument.body.style.overflow).toBe('hidden');
    expect(mockDocument.activeElement).toBe(btnFirst);

    unmountHook();
  });

  it('supports initialFocusRef override', () => {
    const containerRef: RefObject<HTMLElement | null> = { current: container as unknown as HTMLElement };
    const initialFocusRef: RefObject<HTMLElement | null> = { current: btnLast as unknown as HTMLElement };
    const onClose = vi.fn();

    runHook({
      containerRef,
      active: true,
      onClose,
      initialFocusRef,
    });

    expect(mockDocument.activeElement).toBe(btnLast);
    unmountHook();
  });

  it('cycles focus forward when Tab is pressed on last element', () => {
    const containerRef: RefObject<HTMLElement | null> = { current: container as unknown as HTMLElement };
    const triggerRef: RefObject<HTMLElement | null> = { current: trigger as unknown as HTMLElement };
    const onClose = vi.fn();

    runHook({
      containerRef,
      triggerRef,
      active: true,
      onClose,
    });

    btnLast.focus();
    expect(mockDocument.activeElement).toBe(btnLast);

    const tabEvent = new MockKeyboardEvent('keydown', { key: 'Tab' });
    mockDocument.dispatchEvent(tabEvent);

    expect(tabEvent.defaultPrevented).toBe(true);
    expect(mockDocument.activeElement).toBe(btnFirst);

    unmountHook();
  });

  it('cycles focus backward when Shift+Tab is pressed on first element', () => {
    const containerRef: RefObject<HTMLElement | null> = { current: container as unknown as HTMLElement };
    const triggerRef: RefObject<HTMLElement | null> = { current: trigger as unknown as HTMLElement };
    const onClose = vi.fn();

    runHook({
      containerRef,
      triggerRef,
      active: true,
      onClose,
    });

    btnFirst.focus();
    expect(mockDocument.activeElement).toBe(btnFirst);

    const shiftTabEvent = new MockKeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
    mockDocument.dispatchEvent(shiftTabEvent);

    expect(shiftTabEvent.defaultPrevented).toBe(true);
    expect(mockDocument.activeElement).toBe(btnLast);

    unmountHook();
  });

  it('traps focus back into container if activeElement lands outside container', () => {
    const containerRef: RefObject<HTMLElement | null> = { current: container as unknown as HTMLElement };
    const triggerRef: RefObject<HTMLElement | null> = { current: trigger as unknown as HTMLElement };
    const onClose = vi.fn();

    runHook({
      containerRef,
      triggerRef,
      active: true,
      onClose,
    });

    trigger.focus();
    expect(mockDocument.activeElement).toBe(trigger);

    const tabEvent = new MockKeyboardEvent('keydown', { key: 'Tab' });
    mockDocument.dispatchEvent(tabEvent);

    expect(tabEvent.defaultPrevented).toBe(true);
    expect(mockDocument.activeElement).toBe(btnFirst);

    unmountHook();
  });

  it('invokes onClose when Escape is pressed', () => {
    const containerRef: RefObject<HTMLElement | null> = { current: container as unknown as HTMLElement };
    const triggerRef: RefObject<HTMLElement | null> = { current: trigger as unknown as HTMLElement };
    const onClose = vi.fn();

    runHook({
      containerRef,
      triggerRef,
      active: true,
      onClose,
    });

    const escapeEvent = new MockKeyboardEvent('keydown', { key: 'Escape' });
    mockDocument.dispatchEvent(escapeEvent);

    expect(escapeEvent.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);

    unmountHook();
  });

  it('does not invoke onClose on Escape when closeOnEscape is false', () => {
    const containerRef: RefObject<HTMLElement | null> = { current: container as unknown as HTMLElement };
    const triggerRef: RefObject<HTMLElement | null> = { current: trigger as unknown as HTMLElement };
    const onClose = vi.fn();

    runHook({
      containerRef,
      triggerRef,
      active: true,
      onClose,
      closeOnEscape: false,
    });

    const escapeEvent = new MockKeyboardEvent('keydown', { key: 'Escape' });
    mockDocument.dispatchEvent(escapeEvent);

    expect(escapeEvent.defaultPrevented).toBe(false);
    expect(onClose).not.toHaveBeenCalled();

    unmountHook();
  });

  it('restores focus to trigger when deactivated and unlocks body scroll', () => {
    const containerRef: RefObject<HTMLElement | null> = { current: container as unknown as HTMLElement };
    const triggerRef: RefObject<HTMLElement | null> = { current: trigger as unknown as HTMLElement };
    const onClose = vi.fn();

    runHook({
      containerRef,
      triggerRef,
      active: true,
      onClose,
    });

    expect(mockDocument.activeElement).toBe(btnFirst);
    expect(mockDocument.body.style.overflow).toBe('hidden');

    runHook({
      containerRef,
      triggerRef,
      active: false,
      onClose,
    });

    expect(mockDocument.activeElement).toBe(trigger);
    expect(mockDocument.body.style.overflow).toBe('');

    unmountHook();
  });

  it('restores focus to trigger upon unmount while active', () => {
    const containerRef: RefObject<HTMLElement | null> = { current: container as unknown as HTMLElement };
    const triggerRef: RefObject<HTMLElement | null> = { current: trigger as unknown as HTMLElement };
    const onClose = vi.fn();

    runHook({
      containerRef,
      triggerRef,
      active: true,
      onClose,
    });

    expect(mockDocument.activeElement).toBe(btnFirst);

    unmountHook();

    expect(mockDocument.activeElement).toBe(trigger);
  });
});
