/**
 * lib/triage/keyboard — the queue's keyboard contract (#1878).
 *
 * Triage is a repetitive, keyboard-driven job: a maintainer walks the queue,
 * opens an item, sets a status and moves on. The mapping lives in a pure
 * function so the DOM handler stays trivial and the contract can be tested
 * without a browser.
 *
 * Safety rule: no shortcut fires while the user is typing. Inputs, textareas,
 * selects, contenteditable regions and anything with `role="textbox"` swallow
 * keys first, and modifier chords are left for the browser.
 */

import type { TriageStatus } from './types';

export type TriageKeyAction =
  | { type: 'move'; delta: -1 | 1 }
  | { type: 'first' }
  | { type: 'last' }
  | { type: 'open' }
  | { type: 'toggle-select' }
  | { type: 'select-all' }
  | { type: 'clear-selection' }
  | { type: 'set-status'; status: TriageStatus }
  | { type: 'focus-assignee' }
  | { type: 'show-help' };

export interface KeyEventLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  /** `event.target` in the DOM; tests pass a minimal shape. */
  target?: {
    tagName?: string;
    isContentEditable?: boolean;
    getAttribute?: (name: string) => string | null;
  } | null;
}

const STATUS_KEYS: Record<string, TriageStatus> = {
  '1': 'new',
  '2': 'triaged',
  '3': 'in-progress',
  '4': 'resolved',
};

/** True when the event originated in a text-entry surface. */
export function isTypingTarget(target: KeyEventLike['target']): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = (target.tagName ?? '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  const role = target.getAttribute?.('role');
  return role === 'textbox' || role === 'combobox' || role === 'searchbox';
}

/**
 * Maps a key event to an action, or `null` when the key is not ours.
 * `null` means "let the browser have it" — the queue never prevents default
 * for a key it does not handle.
 */
export function mapTriageKey(event: KeyEventLike): TriageKeyAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (isTypingTarget(event.target)) return null;
  if (typeof event.key !== 'string') return null;

  if (STATUS_KEYS[event.key]) return { type: 'set-status', status: STATUS_KEYS[event.key] };

  switch (event.key) {
    case 'j':
    case 'J':
    case 'ArrowDown':
      return { type: 'move', delta: 1 };
    case 'k':
    case 'K':
    case 'ArrowUp':
      return { type: 'move', delta: -1 };
    case 'Home':
      return { type: 'first' };
    case 'End':
      return { type: 'last' };
    case 'Enter':
      return { type: 'open' };
    case ' ':
    case 'Spacebar':
      return { type: 'toggle-select' };
    case 'a':
    case 'A':
      return event.shiftKey ? { type: 'select-all' } : { type: 'focus-assignee' };
    case 'Escape':
      return { type: 'clear-selection' };
    case '?':
      return { type: 'show-help' };
    default:
      return null;
  }
}

/**
 * Applies a movement action to a selection index, clamped to the list. An
 * empty list always yields -1 so callers never point at a phantom row.
 */
export function moveSelection(current: number, delta: -1 | 1, length: number): number {
  if (length <= 0) return -1;
  if (current < 0) return delta > 0 ? 0 : length - 1;
  const next = current + delta;
  if (next < 0) return 0;
  if (next >= length) return length - 1;
  return next;
}

/** Shortcut reference rendered by the `?` overlay and by the aria-description. */
export const TRIAGE_SHORTCUTS: ReadonlyArray<{ keys: string; description: string }> = [
  { keys: 'j / k', description: 'Move down / up' },
  { keys: 'Home / End', description: 'Jump to first / last item' },
  { keys: 'Enter', description: 'Open the focused item' },
  { keys: 'Space', description: 'Toggle selection' },
  { keys: 'Shift + A', description: 'Select all visible items' },
  { keys: 'a', description: 'Focus the assignee field' },
  { keys: '1 – 4', description: 'Set status: new, triaged, in progress, resolved' },
  { keys: 'Esc', description: 'Clear selection' },
  { keys: '?', description: 'Show this help' },
];
