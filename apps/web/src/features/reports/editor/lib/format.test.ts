import { describe, expect, it } from 'vitest';
import { applyFormat, prefixSelectedLines, wrapSelection } from './format';

describe('formatting helpers', () => {
  it('wraps a selection and returns the new selection bounds', () => {
    const result = wrapSelection('hello world', 6, 11, '**', '**', 'placeholder');
    expect(result.text).toBe('hello **world**');
    expect(result.text.slice(result.start, result.end)).toBe('world');
  });

  it('prefixes every selected line and avoids duplicate prefixes', () => {
    expect(prefixSelectedLines('one\ntwo', 0, 7, '- ').text).toBe('- one\n- two');
    expect(prefixSelectedLines('- one\n- two', 0, 11, '- ').text).toBe('- one\n- two');
  });

  it('applies toolbar actions', () => {
    expect(applyFormat('text', 0, 4, 'bold').text).toBe('**text**');
    expect(applyFormat('text', 0, 4, 'link').text).toBe('[text](https://example.com)');
    expect(applyFormat('text', 4, 4, 'table').text).toContain('| Component | Result | Notes |');
    expect(applyFormat('text', 4, 4, 'code-block').text).toContain('```text');
    expect(applyFormat('text', 4, 4, 'checklist').text).toContain('- [ ]');
    expect(applyFormat('text', 0, 4, 'heading').text).toBe('## text');
  });
});
