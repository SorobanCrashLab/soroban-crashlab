import { describe, it, expect } from 'vitest';
import {
  getResponsiveRunColumns,
  getViewportBreakpoint,
  RUN_COLUMN_TIER,
  RUN_TABLE_BREAKPOINTS,
} from './run-table-columns-utils';

const ALL_COLUMNS = ['id', 'status', 'area', 'severity', 'duration', 'seedCount', 'report'];

describe('getViewportBreakpoint', () => {
  it('classifies widths at and above 1024px as desktop', () => {
    expect(getViewportBreakpoint(1024)).toBe('desktop');
    expect(getViewportBreakpoint(1440)).toBe('desktop');
    expect(getViewportBreakpoint(2560)).toBe('desktop');
  });

  it('classifies portrait-tablet widths (768-1023) as tablet', () => {
    expect(getViewportBreakpoint(768)).toBe('tablet');
    expect(getViewportBreakpoint(834)).toBe('tablet');
    expect(getViewportBreakpoint(1023)).toBe('tablet');
  });

  it('classifies widths below 768px as mobile', () => {
    expect(getViewportBreakpoint(320)).toBe('mobile');
    expect(getViewportBreakpoint(375)).toBe('mobile');
    expect(getViewportBreakpoint(767)).toBe('mobile');
  });
});

describe('getResponsiveRunColumns', () => {
  it('keeps every base column on desktop', () => {
    expect(getResponsiveRunColumns(ALL_COLUMNS, 'desktop')).toEqual(ALL_COLUMNS);
  });

  it('drops only seedCount on portrait tablet', () => {
    expect(getResponsiveRunColumns(ALL_COLUMNS, 'tablet')).toEqual([
      'id',
      'status',
      'area',
      'severity',
      'duration',
      'report',
    ]);
  });

  it('keeps only the essential columns on mobile', () => {
    expect(getResponsiveRunColumns(ALL_COLUMNS, 'mobile')).toEqual([
      'id',
      'status',
      'duration',
    ]);
  });

  it('never removes columns the caller did not opt into', () => {
    const limited = ['id', 'seedCount'];
    expect(getResponsiveRunColumns(limited, 'tablet')).toEqual(['id']);
  });

  it('preserves unknown column ids on every breakpoint', () => {
    const withCustom = ['id', 'status', 'seedCount', 'custom-flag'];
    expect(getResponsiveRunColumns(withCustom, 'mobile')).toEqual([
      'id',
      'status',
      'custom-flag',
    ]);
  });

  it('preserves input column order', () => {
    const reordered = ['seedCount', 'id', 'duration', 'report', 'status'];
    expect(getResponsiveRunColumns(reordered, 'tablet')).toEqual([
      'seedCount',
      'id',
      'duration',
      'report',
      'status',
    ].filter((c) => c !== 'seedCount'));
  });
});

describe('column tier table', () => {
  it('defines a tier for every expected run-table column', () => {
    for (const col of ALL_COLUMNS) {
      expect(RUN_COLUMN_TIER[col], `missing tier for ${col}`).toBeDefined();
    }
  });

  it('defines the full set of breakpoints', () => {
    expect(RUN_TABLE_BREAKPOINTS).toEqual(['desktop', 'tablet', 'mobile']);
  });
});