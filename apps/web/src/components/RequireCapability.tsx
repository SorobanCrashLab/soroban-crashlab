'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffectiveAccess, type CapabilityCode } from '../lib/permissions';

export interface RequireCapabilityProps {
  capability: CapabilityCode;
  /**
   * Allowed regardless of the server-reported role — the local
   * `crashlab:maintainer-mode` escape hatch for operators whose identity has
   * not been granted the role yet (documented in ADR-0012: the local toggle
   * opens developer surfaces only; the server still rejects their writes).
   */
  bypass?: boolean;
  /** Hold redirects while caller-side state is still unknown (hydration). */
  defer?: boolean;
  /** Full page navigation instead of a soft router replace. */
  hardRedirect?: boolean;
  /** Rendered while the caller's role is still being resolved. */
  loading?: ReactNode;
  children: ReactNode;
}

/**
 * Route-level capability guard (#1880). Renders `children` only when the
 * caller holds the capability (or `bypass` applies); otherwise navigates to
 * the dedicated `/403?capability=…&from=…` recovery page (replace, not push,
 * so Back does not bounce between the guard and the explanation).
 *
 * Fails open on lookup failure: if `/api/settings/roles/me` errors the page
 * renders and the server remains the authority on every request — a broken
 * mirror must not lock a maintainer out of their own admin surface.
 */
export function RequireCapability({
  capability,
  bypass = false,
  defer = false,
  hardRedirect = false,
  loading = null,
  children,
}: RequireCapabilityProps) {
  const { status, can } = useEffectiveAccess();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status !== 'ready' || defer || bypass) return;
    if (can(capability)) return;
    const from = typeof pathname === 'string' && pathname.length > 0 ? pathname : '/';
    const target = `/403?capability=${encodeURIComponent(capability)}&from=${encodeURIComponent(from)}`;
    if (hardRedirect) {
      window.location.replace(target);
    } else {
      router.replace(target);
    }
  }, [status, defer, bypass, can, capability, pathname, hardRedirect, router]);

  if (bypass) return <>{children}</>;
  if (status === 'error') return <>{children}</>;
  if (status !== 'ready' || defer) return <>{loading}</>;
  if (!can(capability)) return null;
  return <>{children}</>;
}
