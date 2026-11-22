/**
 * lib/route-guard — the single authorization checkpoint for API routes (#1817).
 *
 * Every API request passes through `enforceRouteAuthorization` (via
 * `src/rate-limit.ts`, itself reached from `src/proxy.ts`). The guard resolves
 * the request against the declarative route catalog:
 *
 *  - No catalog entry  → hard deny (`403 UNDECLARED_ROUTE`). A route that forgot
 *    to register is denied rather than implicitly allowed; the catalog
 *    completeness test makes the omission fail CI as well.
 *  - `public`          → allowed without a credential.
 *  - `session`/`token` → delegated to the RBAC check, which reads the required
 *    capability back out of the same catalog entry.
 */

import { NextRequest, NextResponse } from 'next/server';
import { matchRouteCatalogEntry } from './route-catalog';
import { checkRbacPermission } from './rbac';

export const UNDECLARED_ROUTE_CODE = 'UNDECLARED_ROUTE';

/**
 * Returns a denial response when the request must not proceed, or `null` when
 * it may. An undeclared route is always denied.
 */
export async function enforceRouteAuthorization(
  request: NextRequest,
): Promise<NextResponse | null> {
  const pathname = request.nextUrl.pathname;
  const method = request.method;

  const entry = matchRouteCatalogEntry(method, pathname);
  if (!entry) {
    return NextResponse.json(
      {
        error: {
          code: UNDECLARED_ROUTE_CODE,
          message: `Route '${method} ${pathname}' is not registered in the route catalog.`,
        },
      },
      { status: 403 },
    );
  }

  if (entry.authClass === 'public') {
    return null;
  }

  return checkRbacPermission(request);
}
