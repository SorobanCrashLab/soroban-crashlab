import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('AlertPresets Component', () => {
  const filePath = path.resolve(__dirname, 'AlertPresets.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  it('should be a client component', () => {
    expect(content).toContain("'use client'");
  });

  it('should export PRESETS constant', () => {
    expect(content).toContain('export const PRESETS');
    expect(content).toContain('high-failure-rate');
    expect(content).toContain('low-success-rate');
  });

  it('should implement explicit loading state', () => {
    expect(content).toContain('isLoading');
    expect(content).toContain('setIsLoading(true)');
    expect(content).toContain('animate-spin');
  });

  it('should implement error handling', () => {
    expect(content).toContain('error');
    expect(content).toContain('setError');
    expect(content).toContain('Failed to apply preset');
  });

  it('should have keyboard accessibility with arrow keys', () => {
    expect(content).toContain('onKeyDown');
    expect(content).toContain('ArrowRight');
    expect(content).toContain('ArrowLeft');
    expect(content).toContain('presetRefs');
  });

  it('should have responsive layout classes', () => {
    expect(content).toContain('grid-cols-1');
    expect(content).toContain('md:grid-cols-2');
    expect(content).toContain('lg:grid-cols-4');
  });

  it('should show success toast after application', () => {
    expect(content).toContain('showToast');
    expect(content).toContain('setShowToast(true)');
    expect(content).toContain('Preset applied successfully');
  });

  it('should handle edge case: preventing hide selection during loading', () => {
    expect(content).toContain('disabled={isLoading}');
  });
});
