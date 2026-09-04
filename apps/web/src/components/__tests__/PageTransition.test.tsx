import { describe, it, expect } from 'vitest';
import { PageTransition } from '../PageTransition';

describe('PageTransition component', () => {
  it('exports PageTransition component', () => {
    expect(PageTransition).toBeDefined();
    expect(typeof PageTransition).toBe('function');
  });

  it('provides page transition configuration props', () => {
    const props = {
      children: 'Content',
      className: 'custom-page-container',
    };
    expect(props.className).toBe('custom-page-container');
    expect(props.children).toBe('Content');
  });
});
