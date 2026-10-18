/**
 * lib/openapi/openapi-committed.test — the committed spec is generated (#1831).
 *
 * Fails when src/lib/openapi/openapi.json is not byte-identical to the spec
 * derived from the route catalog, so drift is caught by the normal test run
 * even before the CI openapi-gate workflow fires.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildOpenApiSpec, serializeOpenApiSpec } from './spec';

const COMMITTED = path.join(process.cwd(), 'src', 'lib', 'openapi', 'openapi.json');

describe('committed openapi.json', () => {
  it('matches the generated spec byte-for-byte', () => {
    const committed = fs.readFileSync(COMMITTED, 'utf8');
    const generated = serializeOpenApiSpec(buildOpenApiSpec());
    expect(
      committed === generated,
      'openapi.json has drifted from the route catalog — run "pnpm --dir apps/web openapi:update" and commit the result.',
    ).toBe(true);
  });

  it('serializes deterministically with sorted keys', () => {
    const first = serializeOpenApiSpec(buildOpenApiSpec());
    const second = serializeOpenApiSpec(buildOpenApiSpec());
    expect(first).toBe(second);

    const parsed = JSON.parse(first) as { paths: Record<string, unknown> };
    const keys = Object.keys(parsed.paths);
    expect(keys).toEqual([...keys].sort());
  });
});
