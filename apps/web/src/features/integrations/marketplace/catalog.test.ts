import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  filterIntegrations,
  INTEGRATION_CATALOG,
} from './catalog';

describe('filterIntegrations', () => {
  it('filters by category and finds capability and prerequisite text', () => {
    expect(filterIntegrations(INTEGRATION_CATALOG, 'workflow', 'CI').map(({ id }) => id))
      .toEqual(['github-actions']);
    expect(filterIntegrations(INTEGRATION_CATALOG, 'api token', 'All').map(({ id }) => id))
      .toEqual(['grafana']);
  });

  it('matches names without case sensitivity and trims the query', () => {
    expect(filterIntegrations(INTEGRATION_CATALOG, '  PAGERDUTY ', 'All').map(({ id }) => id))
      .toEqual(['pagerduty']);
  });

  it('returns no entries when no catalog entry matches both filters', () => {
    expect(filterIntegrations(INTEGRATION_CATALOG, 'smtp', 'CI')).toEqual([]);
  });

  it('links each catalog entry to an existing setup or activity page', () => {
    const appDirectory = path.resolve(__dirname, '../../../app');
    const destinations = INTEGRATION_CATALOG.flatMap((entry) => [
      entry.href,
      ...(entry.activityHref ? [entry.activityHref] : []),
    ]);

    for (const destination of destinations) {
      expect(existsSync(path.join(appDirectory, destination.slice(1), 'page.tsx'))).toBe(true);
    }
  });
});
