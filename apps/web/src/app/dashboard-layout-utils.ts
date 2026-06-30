/**
 * Dashboard widget layout utilities for section ordering and visibility.
 */

export type DashboardSectionId =
  | 'stats'
  | 'widget-editor'
  | 'recent-runs'
  | 'quick-actions';

export interface DashboardSectionConfig {
  id: DashboardSectionId;
  visible: boolean;
  order: number;
}

export const DEFAULT_DASHBOARD_LAYOUT: DashboardSectionConfig[] = [
  { id: 'stats', visible: true, order: 0 },
  { id: 'widget-editor', visible: true, order: 1 },
  { id: 'recent-runs', visible: true, order: 2 },
  { id: 'quick-actions', visible: true, order: 3 },
];

export const DASHBOARD_LAYOUT_STORAGE_KEY = 'crashlab-dashboard-layout';

export function sortDashboardSections(
  sections: DashboardSectionConfig[],
): DashboardSectionConfig[] {
  return [...sections].sort((a, b) => a.order - b.order);
}

export function getVisibleDashboardSections(
  sections: DashboardSectionConfig[],
): DashboardSectionConfig[] {
  return sortDashboardSections(sections).filter((section) => section.visible);
}

export function reorderDashboardSection(
  sections: DashboardSectionConfig[],
  sectionId: DashboardSectionId,
  newOrder: number,
): DashboardSectionConfig[] {
  const sorted = sortDashboardSections(sections);
  const index = sorted.findIndex((section) => section.id === sectionId);
  if (index === -1) return sections;

  const clamped = Math.max(0, Math.min(newOrder, sorted.length - 1));
  const next = [...sorted];
  const [moved] = next.splice(index, 1);
  next.splice(clamped, 0, moved);

  return next.map((section, order) => ({ ...section, order }));
}

export function toggleDashboardSectionVisibility(
  sections: DashboardSectionConfig[],
  sectionId: DashboardSectionId,
): DashboardSectionConfig[] {
  return sections.map((section) =>
    section.id === sectionId ? { ...section, visible: !section.visible } : section,
  );
}

export function parseDashboardLayout(raw: string | null): DashboardSectionConfig[] {
  if (!raw) return DEFAULT_DASHBOARD_LAYOUT;

  try {
    const parsed = JSON.parse(raw) as DashboardSectionConfig[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_DASHBOARD_LAYOUT;
    }
    const known = new Set(DEFAULT_DASHBOARD_LAYOUT.map((section) => section.id));
    const valid = parsed.filter(
      (section) =>
        known.has(section.id) &&
        typeof section.visible === 'boolean' &&
        typeof section.order === 'number',
    );
    if (valid.length === 0) return DEFAULT_DASHBOARD_LAYOUT;

    const missing = DEFAULT_DASHBOARD_LAYOUT.filter(
      (section) => !valid.some((item) => item.id === section.id),
    );
    return sortDashboardSections([...valid, ...missing]);
  } catch {
    return DEFAULT_DASHBOARD_LAYOUT;
  }
}

export function serializeDashboardLayout(sections: DashboardSectionConfig[]): string {
  return JSON.stringify(sortDashboardSections(sections));
}
