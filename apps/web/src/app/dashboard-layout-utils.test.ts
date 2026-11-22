import {
  sortDashboardSections,
  getVisibleDashboardSections,
  reorderDashboardSection,
  toggleDashboardSectionVisibility,
  parseDashboardLayout,
  serializeDashboardLayout,
  DEFAULT_DASHBOARD_LAYOUT,
  DASHBOARD_LAYOUT_STORAGE_KEY,
  type DashboardSectionConfig,
} from './dashboard-layout-utils';

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected} but got ${actual}`);
  }
}

function assertDeepEqual<T>(actual: T, expected: T, message?: string): void {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(message || `Expected ${expectedStr} but got ${actualStr}`);
  }
}

function assertTrue(condition: boolean, message?: string): void {
  if (!condition) {
    throw new Error(message || 'Condition was false');
  }
}

// DASHBOARD_LAYOUT_STORAGE_KEY constant is exported
{
  assertEqual(DASHBOARD_LAYOUT_STORAGE_KEY, 'crashlab-dashboard-layout');
}

// DEFAULT_DASHBOARD_LAYOUT contains all required sections
{
  assertEqual(DEFAULT_DASHBOARD_LAYOUT.length, 4);
  const ids = DEFAULT_DASHBOARD_LAYOUT.map((s) => s.id);
  assertTrue(ids.includes('stats'));
  assertTrue(ids.includes('widget-editor'));
  assertTrue(ids.includes('recent-runs'));
  assertTrue(ids.includes('quick-actions'));
}

// DEFAULT_DASHBOARD_LAYOUT sections are ordered correctly
{
  const orders = DEFAULT_DASHBOARD_LAYOUT.map((s) => s.order);
  assertDeepEqual(orders, [0, 1, 2, 3]);
}

// DEFAULT_DASHBOARD_LAYOUT sections are all visible by default
{
  assertTrue(DEFAULT_DASHBOARD_LAYOUT.every((s) => s.visible === true));
}

// sortDashboardSections: returns sections sorted by order
{
  const sections: DashboardSectionConfig[] = [
    { id: 'stats', visible: true, order: 2 },
    { id: 'widget-editor', visible: true, order: 0 },
    { id: 'recent-runs', visible: true, order: 1 },
  ];
  const result = sortDashboardSections(sections);
  assertDeepEqual(result.map((s) => s.id), ['widget-editor', 'recent-runs', 'stats']);
}

// sortDashboardSections: does not mutate original array
{
  const sections: DashboardSectionConfig[] = [
    { id: 'stats', visible: true, order: 2 },
    { id: 'widget-editor', visible: true, order: 0 },
  ];
  const original = JSON.parse(JSON.stringify(sections));
  sortDashboardSections(sections);
  assertDeepEqual(sections, original);
}

// sortDashboardSections: handles empty array
{
  const result = sortDashboardSections([]);
  assertDeepEqual(result, []);
}

// getVisibleDashboardSections: returns only visible sections
{
  const sections: DashboardSectionConfig[] = [
    { id: 'stats', visible: true, order: 0 },
    { id: 'widget-editor', visible: false, order: 1 },
    { id: 'recent-runs', visible: true, order: 2 },
  ];
  const result = getVisibleDashboardSections(sections);
  assertEqual(result.length, 2);
  assertDeepEqual(result.map((s) => s.id), ['stats', 'recent-runs']);
}

// getVisibleDashboardSections: returns empty array when all hidden
{
  const sections: DashboardSectionConfig[] = [
    { id: 'stats', visible: false, order: 0 },
    { id: 'widget-editor', visible: false, order: 1 },
  ];
  const result = getVisibleDashboardSections(sections);
  assertDeepEqual(result, []);
}

// reorderDashboardSection: moves section to new position
{
  const sections: DashboardSectionConfig[] = [
    { id: 'stats', visible: true, order: 0 },
    { id: 'widget-editor', visible: true, order: 1 },
    { id: 'recent-runs', visible: true, order: 2 },
  ];
  const result = reorderDashboardSection(sections, 'stats', 2);
  assertDeepEqual(result.map((s) => s.id), ['widget-editor', 'recent-runs', 'stats']);
  assertDeepEqual(result.map((s) => s.order), [0, 1, 2]);
}

// reorderDashboardSection: returns original array if section not found
{
  const sections: DashboardSectionConfig[] = [
    { id: 'stats', visible: true, order: 0 },
    { id: 'widget-editor', visible: true, order: 1 },
  ];
  const result = reorderDashboardSection(sections, 'quick-actions', 0);
  assertDeepEqual(result, sections);
}

// toggleDashboardSectionVisibility: toggles visible to hidden
{
  const sections: DashboardSectionConfig[] = [
    { id: 'stats', visible: true, order: 0 },
    { id: 'widget-editor', visible: true, order: 1 },
  ];
  const result = toggleDashboardSectionVisibility(sections, 'stats');
  const stats = result.find((s) => s.id === 'stats');
  const editor = result.find((s) => s.id === 'widget-editor');
  if (!stats || !editor) throw new Error('Sections not found');
  assertEqual(stats.visible, false);
  assertEqual(editor.visible, true);
}

// toggleDashboardSectionVisibility: toggles hidden to visible
{
  const sections: DashboardSectionConfig[] = [
    { id: 'stats', visible: false, order: 0 },
    { id: 'widget-editor', visible: true, order: 1 },
  ];
  const result = toggleDashboardSectionVisibility(sections, 'stats');
  const stats = result.find((s) => s.id === 'stats');
  if (!stats) throw new Error('Stats not found');
  assertEqual(stats.visible, true);
}

// parseDashboardLayout: returns default for null input
{
  const result = parseDashboardLayout(null);
  assertDeepEqual(result, DEFAULT_DASHBOARD_LAYOUT);
}

// parseDashboardLayout: returns default for empty string
{
  const result = parseDashboardLayout('');
  assertDeepEqual(result, DEFAULT_DASHBOARD_LAYOUT);
}

// parseDashboardLayout: parses valid JSON correctly
{
  const input = JSON.stringify([
    { id: 'stats', visible: false, order: 0 },
    { id: 'widget-editor', visible: true, order: 1 },
    { id: 'recent-runs', visible: true, order: 2 },
    { id: 'quick-actions', visible: true, order: 3 },
  ]);
  const result = parseDashboardLayout(input);
  assertEqual(result.length, 4);
  const stats = result.find((s) => s.id === 'stats');
  if (!stats) throw new Error('Stats not found');
  assertEqual(stats.visible, false);
}

// parseDashboardLayout: returns default for invalid JSON
{
  const result = parseDashboardLayout('not valid json');
  assertDeepEqual(result, DEFAULT_DASHBOARD_LAYOUT);
}

// parseDashboardLayout: returns default for non-array JSON
{
  const result = parseDashboardLayout('{"id": "stats"}');
  assertDeepEqual(result, DEFAULT_DASHBOARD_LAYOUT);
}

// parseDashboardLayout: returns default for empty array
{
  const result = parseDashboardLayout('[]');
  assertDeepEqual(result, DEFAULT_DASHBOARD_LAYOUT);
}

// parseDashboardLayout: filters out invalid sections
{
  const input = JSON.stringify([
    { id: 'stats', visible: true, order: 0 },
    { id: 'invalid-section', visible: true, order: 1 },
    { id: 'widget-editor', visible: true, order: 2 },
  ]);
  const result = parseDashboardLayout(input);
  assertTrue(!result.some((s) => (s.id as string) === 'invalid-section'));
}

// parseDashboardLayout: adds missing sections from default
{
  const input = JSON.stringify([
    { id: 'stats', visible: true, order: 0 },
    { id: 'widget-editor', visible: true, order: 1 },
  ]);
  const result = parseDashboardLayout(input);
  assertEqual(result.length, 4);
  assertTrue(result.some((s) => s.id === 'recent-runs'));
  assertTrue(result.some((s) => s.id === 'quick-actions'));
}

// serializeDashboardLayout: produces valid JSON string
{
  const sections: DashboardSectionConfig[] = [
    { id: 'stats', visible: true, order: 0 },
    { id: 'widget-editor', visible: false, order: 1 },
  ];
  const result = serializeDashboardLayout(sections);
  // Should not throw
  JSON.parse(result);
}

// serializeDashboardLayout: sorts sections before serializing
{
  const sections: DashboardSectionConfig[] = [
    { id: 'widget-editor', visible: true, order: 1 },
    { id: 'stats', visible: true, order: 0 },
  ];
  const result = serializeDashboardLayout(sections);
  const parsed = JSON.parse(result);
  assertDeepEqual(parsed.map((s: DashboardSectionConfig) => s.id), ['stats', 'widget-editor']);
}

// serializeDashboardLayout: preserves all section properties
{
  const sections: DashboardSectionConfig[] = [
    { id: 'stats', visible: false, order: 0 },
    { id: 'widget-editor', visible: true, order: 1 },
  ];
  const result = serializeDashboardLayout(sections);
  const parsed = JSON.parse(result);
  assertEqual(parsed[0].id, 'stats');
  assertEqual(parsed[0].visible, false);
  assertEqual(parsed[0].order, 0);
}

// Integration: round-trip serialization and parsing
{
  const original: DashboardSectionConfig[] = [
    { id: 'stats', visible: false, order: 0 },
    { id: 'widget-editor', visible: true, order: 1 },
    { id: 'recent-runs', visible: true, order: 2 },
    { id: 'quick-actions', visible: false, order: 3 },
  ];
  const serialized = serializeDashboardLayout(original);
  const parsed = parseDashboardLayout(serialized);
  assertDeepEqual(parsed, sortDashboardSections(original));
}

// Integration: complex workflow with multiple operations
{
  let sections = JSON.parse(JSON.stringify(DEFAULT_DASHBOARD_LAYOUT));
  
  // Hide widget-editor
  sections = toggleDashboardSectionVisibility(sections, 'widget-editor');
  const editor = sections.find((s: DashboardSectionConfig) => s.id === 'widget-editor');
  if (!editor) throw new Error('Editor not found');
  assertEqual(editor.visible, false);
  
  // Move stats to last position
  sections = reorderDashboardSection(sections, 'stats', 3);
  const sorted = sortDashboardSections(sections);
  assertEqual(sorted[sorted.length - 1].id, 'stats');
  
  // Get only visible sections
  const visible = getVisibleDashboardSections(sections);
  assertEqual(visible.length, 3);
  assertTrue(!visible.some((s) => s.id === 'widget-editor'));
  
  // Serialize and parse
  const serialized = serializeDashboardLayout(sections);
  const parsed = parseDashboardLayout(serialized);
  assertEqual(parsed.length, 4);
}

console.log('dashboard-layout-utils.test.ts: all assertions passed');
