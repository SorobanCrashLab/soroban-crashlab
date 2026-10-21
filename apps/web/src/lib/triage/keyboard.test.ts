import { describe, expect, it } from 'vitest';
import {
  TRIAGE_SHORTCUTS,
  isTypingTarget,
  mapTriageKey,
  moveSelection,
  type KeyEventLike,
} from './keyboard';

function keyEvent(key: string, overrides: Partial<KeyEventLike> = {}): KeyEventLike {
  return { key, ...overrides };
}

describe('triage queue keyboard', () => {
  describe('mapTriageKey', () => {
    it('moves with j/k and the arrow keys', () => {
      expect(mapTriageKey(keyEvent('j'))).toEqual({ type: 'move', delta: 1 });
      expect(mapTriageKey(keyEvent('k'))).toEqual({ type: 'move', delta: -1 });
      expect(mapTriageKey(keyEvent('ArrowDown'))).toEqual({ type: 'move', delta: 1 });
      expect(mapTriageKey(keyEvent('ArrowUp'))).toEqual({ type: 'move', delta: -1 });
      expect(mapTriageKey(keyEvent('J'))).toEqual({ type: 'move', delta: 1 });
    });

    it('jumps to the ends with Home and End', () => {
      expect(mapTriageKey(keyEvent('Home'))).toEqual({ type: 'first' });
      expect(mapTriageKey(keyEvent('End'))).toEqual({ type: 'last' });
    });

    it('opens, selects and clears', () => {
      expect(mapTriageKey(keyEvent('Enter'))).toEqual({ type: 'open' });
      expect(mapTriageKey(keyEvent(' '))).toEqual({ type: 'toggle-select' });
      expect(mapTriageKey(keyEvent('Escape'))).toEqual({ type: 'clear-selection' });
    });

    it('selects all only with Shift', () => {
      expect(mapTriageKey(keyEvent('A', { shiftKey: true }))).toEqual({ type: 'select-all' });
      expect(mapTriageKey(keyEvent('a'))).toEqual({ type: 'focus-assignee' });
    });

    it('maps the four status digits', () => {
      expect(mapTriageKey(keyEvent('1'))).toEqual({ type: 'set-status', status: 'new' });
      expect(mapTriageKey(keyEvent('2'))).toEqual({ type: 'set-status', status: 'triaged' });
      expect(mapTriageKey(keyEvent('3'))).toEqual({ type: 'set-status', status: 'in-progress' });
      expect(mapTriageKey(keyEvent('4'))).toEqual({ type: 'set-status', status: 'resolved' });
    });

    it('opens help on question mark', () => {
      expect(mapTriageKey(keyEvent('?'))).toEqual({ type: 'show-help' });
    });

    it('ignores keys it does not own', () => {
      expect(mapTriageKey(keyEvent('x'))).toBeNull();
      expect(mapTriageKey(keyEvent('5'))).toBeNull();
      expect(mapTriageKey(keyEvent('Tab'))).toBeNull();
    });

    it('leaves shortcuts alone while the user is typing', () => {
      for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
        expect(mapTriageKey(keyEvent('j', { target: { tagName } }))).toBeNull();
        expect(mapTriageKey(keyEvent('3', { target: { tagName } }))).toBeNull();
      }
      expect(
        mapTriageKey(keyEvent('j', { target: { tagName: 'DIV', isContentEditable: true } })),
      ).toBeNull();
      expect(
        mapTriageKey(
          keyEvent('j', {
            target: { tagName: 'DIV', getAttribute: (name) => (name === 'role' ? 'textbox' : null) },
          }),
        ),
      ).toBeNull();
    });

    it('does not steal browser chords', () => {
      expect(mapTriageKey(keyEvent('j', { ctrlKey: true }))).toBeNull();
      expect(mapTriageKey(keyEvent('j', { metaKey: true }))).toBeNull();
      expect(mapTriageKey(keyEvent('j', { altKey: true }))).toBeNull();
    });

    it('does not throw on a non-string key', () => {
      expect(mapTriageKey({ key: undefined as unknown as string })).toBeNull();
    });
  });

  describe('isTypingTarget', () => {
    it('is false without a target', () => {
      expect(isTypingTarget(null)).toBe(false);
      expect(isTypingTarget(undefined)).toBe(false);
    });

    it('recognises editable text surfaces', () => {
      expect(isTypingTarget({ tagName: 'input' })).toBe(true);
      expect(isTypingTarget({ isContentEditable: true })).toBe(true);
      expect(
        isTypingTarget({ tagName: 'DIV', getAttribute: () => 'combobox' }),
      ).toBe(true);
    });
  });

  describe('moveSelection', () => {
    it('clamps to the list bounds', () => {
      expect(moveSelection(0, -1, 3)).toBe(0);
      expect(moveSelection(2, 1, 3)).toBe(2);
      expect(moveSelection(1, 1, 3)).toBe(2);
      expect(moveSelection(1, -1, 3)).toBe(0);
    });

    it('enters the list from no selection', () => {
      expect(moveSelection(-1, 1, 3)).toBe(0);
      expect(moveSelection(-1, -1, 3)).toBe(2);
    });

    it('returns -1 for an empty list', () => {
      expect(moveSelection(-1, 1, 0)).toBe(-1);
      expect(moveSelection(0, 1, 0)).toBe(-1);
    });
  });

  describe('shortcut reference', () => {
    it('documents every action the mapper can emit', () => {
      const text = TRIAGE_SHORTCUTS.map((entry) => `${entry.keys} ${entry.description}`).join(' ');
      for (const fragment of ['j / k', 'Enter', 'Space', '1 – 4', 'Esc', '?']) {
        expect(text).toContain(fragment);
      }
    });
  });
});
