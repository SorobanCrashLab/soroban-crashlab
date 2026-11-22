import { describe, expect, it } from 'vitest';

import {
  isEditableTarget,
  shouldIgnoreGlobalShortcut,
} from './is-editable-target';

type TargetStub = {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
  parentElement?: TargetStub | null;
};

function shortcutEvent(
  target: TargetStub | null,
  extras: { ctrlKey?: boolean; metaKey?: boolean; key?: string } = {},
) {
  return {
    target: target as unknown as EventTarget,
    ctrlKey: extras.ctrlKey ?? false,
    metaKey: extras.metaKey ?? false,
    key: extras.key ?? 'g',
  };
}

describe('isEditableTarget', () => {
  it('returns false for null and non-element targets', () => {
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget({} as EventTarget)).toBe(false);
  });

  it('treats input, textarea, and select as editable', () => {
    expect(isEditableTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'SELECT' } as unknown as EventTarget)).toBe(true);
  });

  it('treats contenteditable hosts as editable', () => {
    expect(
      isEditableTarget({
        tagName: 'DIV',
        isContentEditable: true,
      } as unknown as EventTarget),
    ).toBe(true);
  });

  it('treats a descendant of a contenteditable host as editable', () => {
    const host: TargetStub = { tagName: 'DIV', isContentEditable: true };
    const nested: TargetStub = {
      tagName: 'SPAN',
      isContentEditable: false,
      closest: (selector: string) =>
        selector.includes('contenteditable') ? host : null,
    };

    expect(isEditableTarget(nested as unknown as EventTarget)).toBe(true);
  });

  it('does not treat body or a button as editable', () => {
    expect(
      isEditableTarget({
        tagName: 'BODY',
        isContentEditable: false,
      } as unknown as EventTarget),
    ).toBe(false);
    expect(
      isEditableTarget({
        tagName: 'BUTTON',
        isContentEditable: false,
      } as unknown as EventTarget),
    ).toBe(false);
  });
});

describe('shouldIgnoreGlobalShortcut', () => {
  it('blocks a plain letter when the target is an input', () => {
    const input: TargetStub = { tagName: 'INPUT' };
    expect(shouldIgnoreGlobalShortcut(shortcutEvent(input, { key: 'g' }))).toBe(true);
  });

  it('allows Ctrl+S when the target is an input', () => {
    const input: TargetStub = { tagName: 'INPUT' };
    expect(
      shouldIgnoreGlobalShortcut(shortcutEvent(input, { key: 's', ctrlKey: true })),
    ).toBe(false);
  });

  it('allows Cmd+S when the target is an input', () => {
    const input: TargetStub = { tagName: 'INPUT' };
    expect(
      shouldIgnoreGlobalShortcut(shortcutEvent(input, { key: 's', metaKey: true })),
    ).toBe(false);
  });

  it('allows a plain letter when the target is the body', () => {
    const body: TargetStub = { tagName: 'BODY', isContentEditable: false };
    expect(shouldIgnoreGlobalShortcut(shortcutEvent(body, { key: 'g' }))).toBe(false);
  });

  it('blocks a plain letter when the target is inside contenteditable', () => {
    const host: TargetStub = { tagName: 'DIV', isContentEditable: true };
    const nested: TargetStub = {
      tagName: 'SPAN',
      isContentEditable: false,
      closest: (selector: string) =>
        selector.includes('contenteditable') ? host : null,
    };

    expect(shouldIgnoreGlobalShortcut(shortcutEvent(nested, { key: 'r' }))).toBe(true);
  });
});
