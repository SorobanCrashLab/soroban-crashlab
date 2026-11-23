import { describe, expect, it } from 'vitest';
import { createChecklistSnippet, parseChecklist, toggleChecklistItem } from './checklist';

describe('checklist block', () => {
  it('parses GFM task lines with ordinals', () => {
    const items = parseChecklist('- [ ] one\n* [x] two\n1. [X] three\nplain');
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.checked)).toEqual([false, true, true]);
    expect(items[2].line).toBe(3);
  });

  it('toggles a single item without touching the others', () => {
    const markdown = '- [ ] one\n- [x] two';
    expect(toggleChecklistItem(markdown, 0)).toBe('- [x] one\n- [x] two');
    expect(toggleChecklistItem(markdown, 1)).toBe('- [ ] one\n- [ ] two');
    expect(toggleChecklistItem(markdown, 9)).toBe(markdown);
  });

  it('creates a deterministic default snippet', () => {
    expect(createChecklistSnippet(['a', 'b'])).toBe('- [ ] a\n- [ ] b');
  });
});
