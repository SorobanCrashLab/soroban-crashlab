'use client';

/**
 * Announces client-side navigations and, when the user has not already moved
 * focus intentionally, moves focus to the main content region (#1884).
 *
 * Without this, an SR user pressing a link in the nav hears nothing: the URL
 * changes but the virtual cursor stays where it was. Focus is only moved when
 * the active element is still `body` so a keyboard user mid-interaction is
 * never yanked away.
 */

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAnnouncer } from './ScreenReaderAnnouncer';

export function routeAnnouncement(pathname: string, title?: string): string {
  const trimmedTitle = (title ?? '').replace(/\s+/g, ' ').trim();
  const page = trimmedTitle.length > 0 ? trimmedTitle : pathname;
  return `Navigated to ${page}`;
}

export default function RouteAnnouncer() {
  const pathname = usePathname();
  const announcer = useAnnouncer();
  const previousPath = useRef<string | null>(null);

  useEffect(() => {
    if (previousPath.current === null) {
      previousPath.current = pathname;
      return;
    }
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;

    announcer.announce(routeAnnouncement(pathname, document.title), {
      politeness: 'polite',
    });

    const active = document.activeElement;
    const main = document.getElementById('main-content');
    if (main && (active === null || active === document.body)) {
      main.focus({ preventScroll: true });
    }
  }, [announcer, pathname]);

  return null;
}
