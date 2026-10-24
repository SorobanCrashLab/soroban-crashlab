import { describe, it, expect } from 'vitest';
import {
  ROUTE_CATALOG,
  matchRouteCatalogEntry,
  routePathMatches,
} from './route-catalog';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function findRouteFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      results.push(...findRouteFiles(fullPath));
    } else if (entry === 'route.ts') {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Inventory of methods a route file exports. Mirrors the static scan the
 * catalog was generated from, so a handler added without registration fails.
 */
function methodsInFile(file: string): string[] {
  const content = readFileSync(file, 'utf-8');
  return ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].filter(
    (m) => new RegExp(`export (async )?function ${m}\\b|export const ${m}\\b`).test(content),
  );
}

function filePathToRoute(file: string): string {
  const relative = file
    .replace(join(process.cwd(), 'src/app'), '')
    .replace(/[\\/]route\.ts$/, '')
    .replace(/\\/g, '/');
  return relative.startsWith('/') ? relative : `/${relative}`;
}

describe('Route Catalog', () => {
  it('has entries defined', () => {
    expect(ROUTE_CATALOG.length).toBeGreaterThan(0);
  });

  it('has no duplicate (method, path) registrations', () => {
    const keys = ROUTE_CATALOG.map((entry) => `${entry.method} ${entry.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('covers every route handler on disk (no unregistered routes)', () => {
    const catalogKeys = new Set(
      ROUTE_CATALOG.map((entry) => `${entry.method} ${entry.path}`),
    );

    for (const file of findRouteFiles(join(process.cwd(), 'src/app/api'))) {
      const routePath = filePathToRoute(file);
      for (const method of methodsInFile(file)) {
        const key = `${method} ${routePath}`;
        if (!catalogKeys.has(key)) {
          expect.fail(`Route ${key} not registered in catalog. File: ${file}`);
        }
      }
    }
  });

  it('declares an auth class for every entry', () => {
    for (const entry of ROUTE_CATALOG) {
      expect(['public', 'session', 'token']).toContain(entry.authClass);
      expect(['default', 'strict', 'lenient', 'none']).toContain(entry.rateLimitClass);
    }
  });

  it('spot-checks each auth class', () => {
    const publicRoute = ROUTE_CATALOG.find((e) => e.path === '/api/health/liveness');
    expect(publicRoute?.authClass).toBe('public');

    const tokenRoute = ROUTE_CATALOG.find((e) => e.path === '/api/health/metrics');
    expect(tokenRoute?.authClass).toBe('token');

    const sessionRoute = ROUTE_CATALOG.find(
      (e) => e.method === 'GET' && e.path === '/api/runs',
    );
    expect(sessionRoute?.authClass).toBe('session');
  });

  it('matches dynamic segments against concrete paths', () => {
    expect(routePathMatches('/api/runs/[id]', '/api/runs/run-42')).toBe(true);
    expect(routePathMatches('/api/runs/[id]', '/api/runs/run-42/annotations')).toBe(false);
    expect(routePathMatches('/api/settings/tokens/[id]/revoke', '/api/settings/tokens/tok_1/revoke')).toBe(true);
  });

  it('resolves a catalog entry for a concrete dynamic path', () => {
    const entry = matchRouteCatalogEntry('DELETE', '/api/runs/run-42');
    expect(entry?.path).toBe('/api/runs/[id]');
    expect(entry?.requiredCapability?.role).toBe('maintainer');
  });

  it('returns null for an undeclared route (deny-by-default)', () => {
    expect(matchRouteCatalogEntry('GET', '/api/not-a-route')).toBeNull();
    expect(matchRouteCatalogEntry('POST', '/api/runs/run-1/not-real')).toBeNull();
  });

  it('preserves the historical role matrix for known endpoints', () => {
    const roleFor = (method: string, pathname: string) =>
      matchRouteCatalogEntry(method, pathname)?.requiredCapability?.role ?? null;

    expect(roleFor('GET', '/api/runs')).toBeNull();
    expect(roleFor('DELETE', '/api/runs/run-1')).toBe('maintainer');
    expect(roleFor('POST', '/api/runs/run-1/replay')).toBe('maintainer');
    expect(roleFor('POST', '/api/settings/alerting')).toBe('maintainer');
    expect(roleFor('POST', '/api/sentry/config')).toBe('maintainer');
    expect(roleFor('POST', '/api/integrations/smtp/config')).toBe('maintainer');
    expect(roleFor('POST', '/api/networks')).toBe('maintainer');
    expect(roleFor('POST', '/api/webhooks/retry')).toBe('maintainer');
    expect(roleFor('POST', '/api/runs/run-1/annotations')).toBe('analyst');
    expect(roleFor('POST', '/api/runs/run-1/tags')).toBe('analyst');
    expect(roleFor('POST', '/api/runs/run-1/issues')).toBe('analyst');
    expect(roleFor('POST', '/api/integrations/pagerduty/trigger')).toBe('analyst');
    expect(roleFor('POST', '/api/artifacts/validate')).toBe('analyst');
  });
});
