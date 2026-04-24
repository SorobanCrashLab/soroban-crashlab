import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('Column Customization Tool Tests', () => {
  const filePath = path.resolve(__dirname, 'add-column-customization.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  it('should be a client component', () => {
    expect(content).toContain("'use client'");
  });

  it('should implement column toggling logic', () => {
    expect(content).toContain('toggleColumn');
    expect(content).toContain('visibleColumns.includes(id)');
  });

  it('should persist settings to localStorage', () => {
    expect(content).toContain('localStorage.getItem(STORAGE_KEY)');
    expect(content).toContain('localStorage.setItem(STORAGE_KEY');
  });

  it('should implement loading state during saving', () => {
    expect(content).toContain('isLoading');
    expect(content).toContain('setIsLoading(true)');
    expect(content).toContain('Saving...');
  });

  it('should have keyboard accessibility with arrow keys', () => {
    expect(content).toContain('onKeyDown');
    expect(content).toContain('ArrowDown');
    expect(content).toContain('ArrowUp');
    expect(content).toContain('columnRefs');
  });

  it('should prevent hiding all columns', () => {
    expect(content).toContain('visibleColumns.length > 1');
    expect(content).toContain('Prevent hiding all columns');
  });

  it('should support dark mode', () => {
    expect(content).toMatch(/dark:/);
  });

  it('should have proper ARIA attributes', () => {
    expect(content).toContain('aria-expanded');
    expect(content).toContain('aria-haspopup');
  });
});
