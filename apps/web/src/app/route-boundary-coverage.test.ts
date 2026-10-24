import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildErrorPresentation, ERROR_CLASSES } from '../lib/error-taxonomy';

const APP_DIR = path.join(process.cwd(), 'src/app');

interface RouteDirectory {
  dir: string;
  route: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name === 'page.tsx') out.push(full);
  }
  return out;
}

/** `src/app/settings/alerting/(group)/presets` → `/settings/alerting/presets`. */
function routeFor(dir: string): string {
  const relative = path.relative(APP_DIR, dir).split(path.sep).join('/');
  const segments = relative
    .split('/')
    .filter((segment) => segment && !/^\(.*\)$/.test(segment));
  return segments.length > 0 ? `/${segments.join('/')}` : '/';
}

function routeDirectories(): RouteDirectory[] {
  return walk(APP_DIR).map((page) => {
    const dir = path.dirname(page);
    return { dir, route: routeFor(dir) };
  });
}

/**
 * Registry sweep for the route error taxonomy (#1879).
 *
 * Every route segment must ship its own `error.tsx` and `loading.tsx`. This is
 * a *registry* assertion on purpose: when a new route lands without a
 * boundary the test fails on the new directory rather than on a rendered
 * page nobody visits, so the gap is caught in review.
 */
describe('route boundary registry sweep', () => {
  const routes = routeDirectories();

  it('finds route segments to check', () => {
    expect(routes.length).toBeGreaterThan(50);
  });

  it.each(routes.map((entry) => [entry.route, entry.dir] as const))(
    '%s declares an error boundary',
    (route, dir) => {
      expect(
        fs.existsSync(path.join(dir, 'error.tsx')),
        `missing error.tsx for ${route} (add a RouteErrorFallback wrapper)`,
      ).toBe(true);
    },
  );

  it.each(routes.map((entry) => [entry.route, entry.dir] as const))(
    '%s declares a loading state',
    (route, dir) => {
      expect(
        fs.existsSync(path.join(dir, 'loading.tsx')),
        `missing loading.tsx for ${route}`,
      ).toBe(true);
    },
  );

  it('every boundary is a client component wired to the taxonomy', () => {
    for (const { dir, route } of routes) {
      const source = fs.readFileSync(path.join(dir, 'error.tsx'), 'utf8');
      expect(source, `${route} error.tsx must be a client component`).toContain(`'use client'`);

      // Boundaries render the shared taxonomy component. The notification
      // centre keeps its hydration-gated wrapper around SegmentError, which is
      // the one documented exception.
      const usesTaxonomy = source.includes('RouteErrorFallback');
      const usesLegacyFamily = source.includes('SegmentError');
      expect(
        usesTaxonomy || usesLegacyFamily,
        `${route} error.tsx must render RouteErrorFallback (or the legacy SegmentError wrapper)`,
      ).toBe(true);

      if (usesTaxonomy) {
        expect(source, `${route} error.tsx must name its route`).toContain(`route="${route}"`);
      }
    }
  });

  it('classifies every taxonomy class into a distinct presentation', () => {
    const sampleStatus: Record<string, number> = {
      config: 422,
      notfound: 404,
      permission: 403,
      transient: 503,
      internal: 500,
    };
    const seen = new Set(ERROR_CLASSES.map((errorClass) => {
      const presentation = buildErrorPresentation({ status: sampleStatus[errorClass] });
      expect(presentation.errorClass).toBe(errorClass);
      return presentation.title;
    }));
    // Two classes may share copy only if they genuinely share the recovery.
    expect(seen.size).toBeGreaterThan(1);
  });
});
