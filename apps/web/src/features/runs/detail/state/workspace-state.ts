/**
 * Deep-linkable state for the unified run investigation workspace (#2257).
 *
 * The workspace is URL-driven: every panel, selection and layout choice lives
 * in the query string so a triage session can be copied into an issue or a
 * chat message and reopened in exactly the same state. This module is pure so
 * it can be unit-tested without a DOM or a router.
 */

export const WORKSPACE_PANELS = [
  'timeline',
  'crashes',
  'logs',
  'artifacts',
  'triage',
  'replay',
] as const;

export type WorkspacePanel = (typeof WORKSPACE_PANELS)[number];

export const LAYOUT_PRESETS = ['investigation', 'triage', 'replay'] as const;
export type WorkspaceLayoutPreset = (typeof LAYOUT_PRESETS)[number];

export interface WorkspaceState {
  layout: WorkspaceLayoutPreset;
  activePanel: WorkspacePanel;
  selectedCrashId: string | null;
  selectedArtifactId: string | null;
  selectedLogLine: number | null;
  replayCursorMs: number | null;
  collapsed: readonly WorkspacePanel[];
  query: string;
}

/** Panel emphasis for each preset. Triage and replay keep secondary panels visible. */
export const LAYOUT_PANEL_ORDER: Record<WorkspaceLayoutPreset, readonly WorkspacePanel[]> = {
  investigation: ['timeline', 'crashes', 'logs', 'artifacts', 'triage', 'replay'],
  triage: ['crashes', 'triage', 'logs', 'timeline', 'artifacts', 'replay'],
  replay: ['replay', 'timeline', 'crashes', 'logs', 'artifacts', 'triage'],
};

export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  layout: 'investigation',
  activePanel: 'timeline',
  selectedCrashId: null,
  selectedArtifactId: null,
  selectedLogLine: null,
  replayCursorMs: null,
  collapsed: [],
  query: '',
};

export const WORKSPACE_QUERY_KEYS = {
  layout: 'ws.layout',
  panel: 'ws.panel',
  crash: 'ws.crash',
  artifact: 'ws.artifact',
  log: 'ws.log',
  cursor: 'ws.cursor',
  collapsed: 'ws.collapsed',
  query: 'ws.query',
} as const;

function isPanel(value: unknown): value is WorkspacePanel {
  return typeof value === 'string' && (WORKSPACE_PANELS as readonly string[]).includes(value);
}

function isPreset(value: unknown): value is WorkspaceLayoutPreset {
  return typeof value === 'string' && (LAYOUT_PRESETS as readonly string[]).includes(value);
}

function optionalString(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 256) : null;
}

function optionalNonNegativeInt(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Parse query parameters defensively; unknown values fall back to defaults. */
export function parseWorkspaceState(params: URLSearchParams): WorkspaceState {
  const layoutParam = params.get(WORKSPACE_QUERY_KEYS.layout);
  const panelParam = params.get(WORKSPACE_QUERY_KEYS.panel);
  const collapsed = (params.get(WORKSPACE_QUERY_KEYS.collapsed) ?? '')
    .split(',')
    .filter(isPanel);

  return {
    layout: isPreset(layoutParam) ? layoutParam : DEFAULT_WORKSPACE_STATE.layout,
    activePanel: isPanel(panelParam) ? panelParam : DEFAULT_WORKSPACE_STATE.activePanel,
    selectedCrashId: optionalString(params.get(WORKSPACE_QUERY_KEYS.crash)),
    selectedArtifactId: optionalString(params.get(WORKSPACE_QUERY_KEYS.artifact)),
    selectedLogLine: optionalNonNegativeInt(params.get(WORKSPACE_QUERY_KEYS.log)),
    replayCursorMs: optionalNonNegativeInt(params.get(WORKSPACE_QUERY_KEYS.cursor)),
    collapsed: Array.from(new Set(collapsed)),
    query: (params.get(WORKSPACE_QUERY_KEYS.query) ?? '').slice(0, 256),
  };
}

/**
 * Serialize only non-default values. Keeping the URL short matters when it is
 * pasted into an issue comment, and avoids needless history entries.
 */
export function serializeWorkspaceState(state: WorkspaceState, base?: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(base?.toString() ?? '');
  const set = (key: string, value: string | null) => {
    if (value === null || value === '') params.delete(key);
    else params.set(key, value);
  };

  set(WORKSPACE_QUERY_KEYS.layout, state.layout === DEFAULT_WORKSPACE_STATE.layout ? null : state.layout);
  set(WORKSPACE_QUERY_KEYS.panel, state.activePanel === DEFAULT_WORKSPACE_STATE.activePanel ? null : state.activePanel);
  set(WORKSPACE_QUERY_KEYS.crash, state.selectedCrashId);
  set(WORKSPACE_QUERY_KEYS.artifact, state.selectedArtifactId);
  set(WORKSPACE_QUERY_KEYS.log, state.selectedLogLine === null ? null : String(state.selectedLogLine));
  set(WORKSPACE_QUERY_KEYS.cursor, state.replayCursorMs === null ? null : String(state.replayCursorMs));
  set(WORKSPACE_QUERY_KEYS.collapsed, state.collapsed.length === 0 ? null : state.collapsed.join(','));
  set(WORKSPACE_QUERY_KEYS.query, state.query);
  return params;
}

export interface WorkspaceSelection {
  crashId?: string | null;
  artifactId?: string | null;
  logLine?: number | null;
  replayCursorMs?: number | null;
}

/**
 * Selecting an item in one panel focuses the owning panel while preserving
 * the rest of the selection. This is the cross-panel synchronization primitive
 * used by the crash, log, artifact and replay views.
 */
export function selectWorkspaceItem(state: WorkspaceState, selection: WorkspaceSelection): WorkspaceState {
  const next: WorkspaceState = { ...state, collapsed: state.collapsed };
  let focus: WorkspacePanel | null = null;

  if (selection.crashId !== undefined) {
    next.selectedCrashId = selection.crashId;
    if (selection.crashId !== null) focus = 'crashes';
  }
  if (selection.artifactId !== undefined) {
    next.selectedArtifactId = selection.artifactId;
    if (selection.artifactId !== null) focus = 'artifacts';
  }
  if (selection.logLine !== undefined) {
    next.selectedLogLine = selection.logLine;
    if (selection.logLine !== null) focus = 'logs';
  }
  if (selection.replayCursorMs !== undefined) {
    next.replayCursorMs = selection.replayCursorMs;
    if (selection.replayCursorMs !== null) focus = 'replay';
  }

  if (focus) {
    next.activePanel = focus;
    next.collapsed = state.collapsed.filter((panel) => panel !== focus);
  }
  return next;
}

export function togglePanel(state: WorkspaceState, panel: WorkspacePanel): WorkspaceState {
  const hidden = state.collapsed.includes(panel)
    ? state.collapsed.filter((entry) => entry !== panel)
    : [...state.collapsed, panel];

  // The workspace always keeps at least one panel visible. When the last
  // visible panel is hidden, restore the layout's first panel instead.
  const order = LAYOUT_PANEL_ORDER[state.layout];
  const collapsed = hidden.length >= WORKSPACE_PANELS.length
    ? hidden.filter((entry) => entry !== order[0])
    : hidden;

  return {
    ...state,
    collapsed,
    activePanel: collapsed.includes(panel)
      ? (order.find((entry) => !collapsed.includes(entry)) ?? panel)
      : panel,
  };
}

export function panelOrder(state: WorkspaceState): readonly WorkspacePanel[] {
  return LAYOUT_PANEL_ORDER[state.layout];
}
