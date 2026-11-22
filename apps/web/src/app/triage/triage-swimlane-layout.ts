/**
 * app/triage/triage-swimlane-layout — persisted swimlane config (#1667).
 * Mirrors widget-grid.ts (pure layout math) + dashboard-layout-utils.ts
 * (parse→heal→serialize) + saved-filter-presets-utils.ts (export/import).
 */

export type SwimlaneGroupBy = 'status' | 'severity' | 'area';

export interface SwimlaneConfig {
  groupBy: SwimlaneGroupBy;
  order: string[];
  collapsed: Record<string, boolean>;
}

export const DEFAULT_SWIMLANE_ORDER: Record<SwimlaneGroupBy, string[]> = {
  status: ['failed', 'active', 'cancelled'],
  severity: ['critical', 'high', 'medium', 'low'],
  area: ['auth', 'state', 'budget', 'xdr'],
};

export const DEFAULT_SWIMLANE_CONFIG: SwimlaneConfig = {
  groupBy: 'status',
  order: [...DEFAULT_SWIMLANE_ORDER.status],
  collapsed: {},
};

export function parseSwimlaneConfig(raw: unknown): SwimlaneConfig {
  const fallback = { ...DEFAULT_SWIMLANE_CONFIG, order: [...DEFAULT_SWIMLANE_CONFIG.order], collapsed: {} };
  if (!raw || typeof raw !== 'object') return fallback;
  const r = raw as Partial<SwimlaneConfig>;
  const groupBy: SwimlaneGroupBy =
    r.groupBy === 'severity' || r.groupBy === 'area' || r.groupBy === 'status' ? r.groupBy : 'status';
  const defaults = DEFAULT_SWIMLANE_ORDER[groupBy];
  const order = Array.isArray(r.order) && r.order.length > 0
    ? [...new Set([...r.order.filter((v) => typeof v === 'string'), ...defaults.filter((d) => !(r.order as string[]).includes(d))])]
    : [...defaults];
  const collapsed: Record<string, boolean> = {};
  if (r.collapsed && typeof r.collapsed === 'object') {
    for (const [k, v] of Object.entries(r.collapsed)) {
      if (typeof v === 'boolean') collapsed[k] = v;
    }
  }
  return { groupBy, order, collapsed };
}

export function serializeSwimlaneConfig(config: SwimlaneConfig): string {
  return JSON.stringify(config);
}

export function toggleSwimlaneCollapsed(config: SwimlaneConfig, lane: string): SwimlaneConfig {
  return { ...config, collapsed: { ...config.collapsed, [lane]: !config.collapsed[lane] } };
}

export function exportSwimlaneAsJson(config: SwimlaneConfig): string {
  return JSON.stringify({ kind: 'triage-swimlane', version: 1, config }, null, 2);
}

export function importSwimlaneFromJson(raw: string): SwimlaneConfig | null {
  try {
    const parsed = JSON.parse(raw) as { config?: unknown };
    if (!parsed || typeof parsed !== 'object' || !('config' in parsed)) return null;
    return parseSwimlaneConfig(parsed.config);
  } catch {
    return null;
  }
}
