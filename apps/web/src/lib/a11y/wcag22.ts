/**
 * WCAG 2.2 AA helpers (#2259).
 *
 * Pure utilities for the programmatic parts of the conformance work: focus
 * order normalization, roving-tabindex movement, target-size measurement and
 * user-preference resolution. The React bindings live in `hooks/` and
 * `components/a11y/`; keeping the logic here makes the rules unit-testable.
 */

export type FocusableKind = 'link' | 'button' | 'input' | 'select' | 'textarea' | 'custom';

export interface FocusableDescriptor {
  id: string;
  kind: FocusableKind;
  tabIndex: number;
  disabled?: boolean;
  hidden?: boolean;
}

/** WCAG 2.4.3: exactly one logical tab stop per composite widget. */
export function normalizeTabOrder(items: readonly FocusableDescriptor[], activeId: string | null): FocusableDescriptor[] {
  return items.map((item) => {
    const eligible = !item.disabled && !item.hidden && item.kind !== 'custom';
    return { ...item, tabIndex: eligible && item.id === activeId ? 0 : -1 };
  });
}

/** Roving tabindex movement for composite widgets (roving tabstop pattern). */
export function nextRovingIndex(
  count: number,
  current: number,
  key: 'ArrowRight' | 'ArrowDown' | 'ArrowLeft' | 'ArrowUp' | 'Home' | 'End',
  loop = true,
): number {
  if (count <= 0) return -1;
  const forward = key === 'ArrowRight' || key === 'ArrowDown';
  const backward = key === 'ArrowLeft' || key === 'ArrowUp';
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (!forward && !backward) return current;
  const delta = forward ? 1 : -1;
  const next = current + delta;
  if (next >= 0 && next < count) return next;
  if (!loop) return current;
  return (next + count) % count;
}

/** WCAG 2.5.8 Target Size (Minimum): 24×24 CSS px with a 24px spacing circle. */
export const MIN_TARGET_SIZE_PX = 24;

export interface TargetBox {
  width: number;
  height: number;
  /** Distance to the nearest adjacent target edge, when known. */
  spacing?: number;
}

export function meetsTargetSize(box: TargetBox): boolean {
  if (!Number.isFinite(box.width) || !Number.isFinite(box.height)) return false;
  if (box.width >= MIN_TARGET_SIZE_PX && box.height >= MIN_TARGET_SIZE_PX) return true;
  return box.spacing !== undefined && box.spacing >= MIN_TARGET_SIZE_PX;
}

export type MotionPreference = 'system' | 'reduced' | 'full';

export function resolveReducedMotion(pref: MotionPreference, systemReduced: boolean): boolean {
  if (pref === 'reduced') return true;
  if (pref === 'full') return false;
  return systemReduced;
}

export type ContrastPreference = 'system' | 'normal' | 'high';

export function resolveHighContrast(pref: ContrastPreference, systemHigh: boolean): boolean {
  if (pref === 'high') return true;
  if (pref === 'normal') return false;
  return systemHigh;
}

/** Touch target spacing check for dense tables: returns offending row indices. */
export function findUndersizedTargets(boxes: readonly TargetBox[]): number[] {
  return boxes.flatMap((box, index) => (meetsTargetSize(box) ? [] : [index]));
}

/** Stable label for aria-live status regions; empty messages are ignored. */
export function liveRegionMessage(message: string, maxLength = 240): string {
  return message.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}
