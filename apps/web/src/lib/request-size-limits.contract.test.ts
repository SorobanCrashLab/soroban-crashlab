import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Contract: every API route that consumes a request body must bound it.
 *
 * Automatically walks `src/app/api` recursively and verifies that any route
 * exporting a mutating handler (POST/PUT/PATCH/DELETE) which reads the
 * request body carries at least one enforcement mechanism:
 *   - checkRequestSize(...) (uniform, content-length based), or
 *   - withRouteErrorHandling(...) (uniform choke point that now enforces
 *     the size limit itself), or
 *   - withSizeLimitAndLogging(...), or
 *   - an inline content-length guard (e.g. the artifact validator).
 *
 * GET-only routes and mutating handlers that ignore the body entirely are
 * exempt — there is nothing to bound.
 */

const API_DIR = join(process.cwd(), 'src', 'app', 'api');

function collectRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectRouteFiles(full));
    } else if (entry === 'route.ts' || entry === 'route.tsx') {
      out.push(full);
    }
  }
  return out;
}

const BODY_CONSUMING_PATTERNS = [
  /request\.json\(/,
  /readJsonBody\(/,
  /request\.text\(/,
  /request\.formData\(/,
  /request\.arrayBuffer\(/,
];

const SIZE_GUARD_PATTERNS = [
  /checkRequestSize\(/,
  /withRouteErrorHandling\(/,
  /withSizeLimitAndLogging\(/,
  /content-length/,
];

function hasBodyConsumption(source: string): boolean {
  return BODY_CONSUMING_PATTERNS.some((re) => re.test(source));
}

function hasSizeGuard(source: string): boolean {
  return SIZE_GUARD_PATTERNS.some((re) => re.test(source));
}

describe('request size limit contract', () => {
  it('every body-consuming mutating route declares a size guard', () => {
    const routeFiles = collectRouteFiles(API_DIR);
    expect(routeFiles.length).toBeGreaterThanOrEqual(50);

    const violations: string[] = [];
    for (const file of routeFiles) {
      const source = readFileSync(file, 'utf8');
      const hasMutatingHandler =
        /export async function (POST|PUT|PATCH|DELETE)/.test(source) ||
        /export (async )?function (POST|PUT|PATCH|DELETE)/.test(source);

      if (!hasMutatingHandler) {
        continue;
      }

      if (hasBodyConsumption(source) && !hasSizeGuard(source)) {
        violations.push(file.replace(join(process.cwd(), 'src'), 'src'));
      }
    }

    expect(violations).toEqual([]);
  });

  it('the uniform wrapper enforces the size limit by default', () => {
    const routeHandler = readFileSync(join(process.cwd(), 'src', 'lib', 'route-handler.ts'), 'utf8');
    expect(routeHandler).toMatch(/checkRequestSize\(request\)/);
    expect(routeHandler).toMatch(/enforceSizeLimit = true/);
  });
});