const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [contenteditable=""]';

type ElementLike = {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
  parentElement?: unknown;
};

function asElementLike(target: EventTarget | null): ElementLike | null {
  if (target == null || typeof target !== 'object') {
    return null;
  }
  return target as ElementLike;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  const seen = new Set<object>();
  let current: ElementLike | null = asElementLike(target);

  while (current) {
    if (seen.has(current)) {
      return false;
    }
    seen.add(current);

    if (typeof current.tagName === 'string' && EDITABLE_TAGS.has(current.tagName.toUpperCase())) {
      return true;
    }

    if (current.isContentEditable === true) {
      return true;
    }

    if (typeof current.closest === 'function') {
      if (current.closest(EDITABLE_SELECTOR)) {
        return true;
      }
    }

    current = asElementLike((current.parentElement as EventTarget | null) ?? null);
  }

  return false;
}

export function shouldIgnoreGlobalShortcut(event: {
  target: EventTarget | null;
  ctrlKey: boolean;
  metaKey: boolean;
}): boolean {
  if (event.ctrlKey || event.metaKey) {
    return false;
  }
  return isEditableTarget(event.target);
}
