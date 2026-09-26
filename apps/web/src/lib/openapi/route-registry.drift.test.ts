/**
 * lib/openapi/route-registry.drift.test — spec-drift check (#1670).
 * Fails if a route handler exists without a registry entry, or if the
 * generated spec is not valid OpenAPI 3.1 (info/paths/components present).
 */
import { describe, expect, it } from 'vitest';
import { ROUTE_REGISTRY } from './registry';
import { buildOpenApiSpec, OPENAPI_VERSION } from './spec';

// Inventory of app/api/**/route.ts handlers (update with the registry).
// Kept as a static list so the test runs without filesystem access.
const KNOWN_ROUTES = [
  'GET /api/health',
  'GET /api/health/metrics',
  'GET /api/runs',
  'POST /api/runs',
  'GET /api/runs/{id}',
  'DELETE /api/runs/{id}',
  'GET /api/runs/{id}/annotations',
  'POST /api/runs/{id}/annotations',
  'GET /api/runs/{id}/issues',
  'POST /api/runs/{id}/issues',
  'GET /api/runs/{id}/tags',
  'POST /api/runs/{id}/tags',
  'POST /api/runs/{id}/replay',
  'GET /api/runs/{id}/replay-history',
  'GET /api/runs/{id}/stream',
  'GET /api/artifacts',
  'POST /api/artifacts',
  'GET /api/artifacts/{id}',
  'POST /api/artifacts/validate',
  'GET /api/campaigns',
  'POST /api/campaigns',
  'POST /api/webhooks/retry',
  'POST /api/webhooks/recovery',
  'POST /api/schedules/tick',
  'POST /api/uploadthing',
];

describe('openapi route registry drift', () => {
  it('covers every known route handler', () => {
    const keys = new Set(ROUTE_REGISTRY.map((e) => `${e.method} ${e.path}`));
    for (const route of KNOWN_ROUTES) {
      expect(keys.has(route), `missing registry entry for ${route}`).toBe(true);
    }
  });

  it('builds a valid OpenAPI 3.1 document', () => {
    const spec = buildOpenApiSpec();
    expect(spec.openapi).toBe(OPENAPI_VERSION);
    expect(spec.info.title).toMatch(/CrashLab/);
    expect(Object.keys(spec.paths).length).toBeGreaterThan(20);
    expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
    expect(spec.components.schemas.FuzzingRun).toBeDefined();
    expect(spec.components.schemas.SuccessEnvelope).toBeDefined();
  });
});
