import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  REQUEST_SIZE_LIMIT_CLASSES,
  routeClassFor,
  requestSizeConfigForClass,
} from './request-size-limits';

/**
 * Contract (#1572): every API route that consumes a request body must declare
 * a size limit at the shared choke point before reading it.
 *
 * The walk covers `export async function POST(...)` as well as the
 * `export const POST = withRouteErrorHandling(...)` / `createRouteHandler(...)`
 * compositions used by current routes. GET-only handlers and mutating handlers
 * that never read a body are exempt — there is nothing to bound.
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
  /request\.body\??\.getReader\(/,
  /\.getReader\(\)/,
];

/**
 * Only shared enforcement or the standard response helper count. A bare
 * `content-length` check with an ad-hoc envelope is not a valid declaration.
 */
const SIZE_GUARD_PATTERNS = [
  /withRouteErrorHandling\(/,
  /withSizeLimitAndLogging\(/,
  /createRouteHandler\(/,
  /checkRequestSize\(/,
  /limitRequestBody\(/,
  /standardSizeLimitResponse\(/,
];

const MUTATING_HANDLER_PATTERN =
  /export\s+(?:async\s+)?(?:function|const)\s+(POST|PUT|PATCH|DELETE)\b/;

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
      if (!MUTATING_HANDLER_PATTERN.test(source)) continue;
      if (hasBodyConsumption(source) && !hasSizeGuard(source)) {
        violations.push(file.replace(join(process.cwd(), 'src'), 'src'));
      }
    }

    expect(violations).toEqual([]);
  });

  it('defines a bounded cap for every route class', () => {
    expect(Object.keys(REQUEST_SIZE_LIMIT_CLASSES).sort()).toEqual([
      'artifact',
      'default',
      'settings',
      'webhook',
    ]);
    for (const config of Object.values(REQUEST_SIZE_LIMIT_CLASSES)) {
      expect(config.maxBodySize).toBeGreaterThan(0);
      expect(config.maxJsonSize).toBeGreaterThan(0);
      expect(config.maxFormDataSize).toBeGreaterThan(0);
      expect(config.maxJsonSize).toBeLessThanOrEqual(config.maxBodySize);
      expect(config.maxFormDataSize).toBeLessThanOrEqual(config.maxBodySize);
    }
    expect(requestSizeConfigForClass('artifact').maxBodySize).toBe(20 * 1024 * 1024);
  });

  it('classifies webhook, artifact and settings paths explicitly', () => {
    expect(routeClassFor('/api/webhooks/retry')).toBe('webhook');
    expect(routeClassFor('/api/integrations/pagerduty/webhook')).toBe('webhook');
    expect(routeClassFor('/api/artifacts/validate')).toBe('artifact');
    expect(routeClassFor('/api/uploadthing')).toBe('artifact');
    expect(routeClassFor('/api/settings/tokens')).toBe('settings');
    expect(routeClassFor('/api/runs')).toBe('default');
  });

  it('the uniform wrappers enforce the size limit by default', () => {
    const routeHandler = readFileSync(join(process.cwd(), 'src', 'lib', 'route-handler.ts'), 'utf8');
    expect(routeHandler).toMatch(/checkRequestSize\(request, (?:sizeConfig|effectiveConfig)\)/);
    expect(routeHandler).toMatch(/enforceSizeLimit = true/);
    expect(routeHandler).toMatch(/route_class: /);
  });
});
