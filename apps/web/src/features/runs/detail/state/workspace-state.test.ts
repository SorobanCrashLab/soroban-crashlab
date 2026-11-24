import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORKSPACE_STATE,
  LAYOUT_PANEL_ORDER,
  WORKSPACE_PANELS,
  panelOrder,
  parseWorkspaceState,
  selectWorkspaceItem,
  serializeWorkspaceState,
  togglePanel,
} from './workspace-state';

describe('run workspace deep links', () => {
  it('uses stable defaults for empty query strings', () => {
    expect(parseWorkspaceState(new URLSearchParams())).toEqual(DEFAULT_WORKSPACE_STATE);
  });

  it('round-trips a full workspace state', () => {
    const state = {
      ...DEFAULT_WORKSPACE_STATE,
      layout: 'triage' as const,
      activePanel: 'logs' as const,
      selectedCrashId: 'crash-7',
      selectedArtifactId: 'artifact-2',
      selectedLogLine: 42,
      replayCursorMs: 1500,
      collapsed: ['replay'] as const,
      query: 'panic',
    };
    const serialized = serializeWorkspaceState(state);
    expect(parseWorkspaceState(serialized)).toEqual(state);
  });

  it('drops unknown layout, panel and negative numbers', () => {
    const params = new URLSearchParams({
      'ws.layout': 'unknown',
      'ws.panel': 'nope',
      'ws.log': '-4',
      'ws.cursor': 'abc',
      'ws.collapsed': 'replay,nope,logs,replay',
    });
    const parsed = parseWorkspaceState(params);
    expect(parsed.layout).toBe('investigation');
    expect(parsed.activePanel).toBe('timeline');
    expect(parsed.selectedLogLine).toBeNull();
    expect(parsed.replayCursorMs).toBeNull();
    expect(parsed.collapsed).toEqual(['replay', 'logs']);
  });

  it('omits default values from the serialized URL', () => {
    const serialized = serializeWorkspaceState(DEFAULT_WORKSPACE_STATE);
    expect(serialized.toString()).toBe('');
  });

  it('preserves unrelated query parameters', () => {
    const base = new URLSearchParams('view=workspace&tab=all');
    const serialized = serializeWorkspaceState({ ...DEFAULT_WORKSPACE_STATE, activePanel: 'crashes' }, base);
    expect(serialized.get('view')).toBe('workspace');
    expect(serialized.get('tab')).toBe('all');
    expect(serialized.get('ws.panel')).toBe('crashes');
  });

  it('focuses the owning panel when cross-panel selections change', () => {
    const selected = selectWorkspaceItem(DEFAULT_WORKSPACE_STATE, { crashId: 'c1', logLine: 10 });
    expect(selected.activePanel).toBe('logs');
    expect(selected.selectedCrashId).toBe('c1');
    expect(selected.selectedLogLine).toBe(10);
  });

  it('expands a collapsed panel when it receives a selection', () => {
    const collapsed = { ...DEFAULT_WORKSPACE_STATE, collapsed: ['artifacts' as const] };
    const selected = selectWorkspaceItem(collapsed, { artifactId: 'a1' });
    expect(selected.collapsed).toEqual([]);
    expect(selected.activePanel).toBe('artifacts');
  });

  it('toggles panels and never leaves the workspace with zero visible panels', () => {
    let state = DEFAULT_WORKSPACE_STATE;
    for (const panel of WORKSPACE_PANELS) {
      state = togglePanel(state, panel);
    }
    expect(state.collapsed.length).toBeLessThan(WORKSPACE_PANELS.length);
    expect(WORKSPACE_PANELS).toContain(state.activePanel);
  });

  it('honors layout-specific panel ordering', () => {
    expect(panelOrder({ ...DEFAULT_WORKSPACE_STATE, layout: 'replay' })).toEqual(LAYOUT_PANEL_ORDER.replay);
  });
});
