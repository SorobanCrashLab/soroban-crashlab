import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SWIMLANE_CONFIG,
  exportSwimlaneAsJson,
  importSwimlaneFromJson,
  parseSwimlaneConfig,
} from './triage-swimlane-layout';

describe('triage swimlane layout', () => {
  it('round-trips through parse/serialize', () => {
    const parsed = parseSwimlaneConfig(DEFAULT_SWIMLANE_CONFIG);
    expect(parsed.groupBy).toBe('status');
    expect(parsed.order).toContain('failed');
  });

  it('heals unknown group-by and preserves collapsed flags', () => {
    const parsed = parseSwimlaneConfig({ groupBy: 'nope', order: ['failed'], collapsed: { failed: true, x: 'yes' } });
    expect(parsed.groupBy).toBe('status');
    expect(parsed.collapsed).toEqual({ failed: true });
  });

  it('exports and re-imports via the layout-preset pattern', () => {
    const json = exportSwimlaneAsJson(DEFAULT_SWIMLANE_CONFIG);
    expect(importSwimlaneFromJson(json)).toEqual(DEFAULT_SWIMLANE_CONFIG);
    expect(importSwimlaneFromJson('not json')).toBeNull();
  });
});
