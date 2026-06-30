import * as assert from 'node:assert/strict';
import {
  DEFAULT_DASHBOARD_LAYOUT,
  getVisibleDashboardSections,
  parseDashboardLayout,
  reorderDashboardSection,
  serializeDashboardLayout,
  toggleDashboardSectionVisibility,
} from './dashboard-layout-utils';

const runAssertions = () => {
  assert.equal(getVisibleDashboardSections(DEFAULT_DASHBOARD_LAYOUT).length, 4);

  const hidden = toggleDashboardSectionVisibility(DEFAULT_DASHBOARD_LAYOUT, 'widget-editor');
  assert.equal(getVisibleDashboardSections(hidden).some((s) => s.id === 'widget-editor'), false);

  const reordered = reorderDashboardSection(DEFAULT_DASHBOARD_LAYOUT, 'quick-actions', 0);
  assert.equal(reordered[0].id, 'quick-actions');

  const parsed = parseDashboardLayout(serializeDashboardLayout(DEFAULT_DASHBOARD_LAYOUT));
  assert.equal(parsed.length, DEFAULT_DASHBOARD_LAYOUT.length);
};

runAssertions();
console.log('dashboard-layout-utils.test.ts: all assertions passed');
