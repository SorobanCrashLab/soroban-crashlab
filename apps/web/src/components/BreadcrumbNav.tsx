'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';

interface BreadcrumbSegment {
  label: string;
  href?: string;
}

interface BreadcrumbNavProps {
  /** Optional override path segments. When omitted, segments are auto-derived from the current URL. */
  segments?: BreadcrumbSegment[];
  /** Label for the home/root crumb. Defaults to "Dashboard". */
  homeLabel?: string;
}

/**
 * BreadcrumbNav — Reusable breadcrumb navigation component.
 *
 * Auto-generates breadcrumbs from the current route path when no custom
 * segments are provided.  Dynamic route segments (e.g. `[id]`) are displayed
 * as "Detail".  Kebab-case and camelCase segment names are humanised.
 *
 * Responsive: collapses to a horizontally-scrollable strip on narrow viewports
 * (<640px) so the user can swipe through long paths.
 *
 * Theme-aware: uses CSS custom properties from the Navy Professional design
 * system for seamless light/dark mode support.
 *
 * Accessibility: wrapped in a `<nav aria-label="Breadcrumb">` landmark.
 */
export default function BreadcrumbNav({
  segments,
  homeLabel = 'Dashboard',
}: BreadcrumbNavProps) {
  const pathname = usePathname();

  const items: BreadcrumbSegment[] = React.useMemo(() => {
    if (segments) return segments;

    const parts = pathname.split('/').filter(Boolean);
    if (parts.length === 0) return [];

    const crumbs: BreadcrumbSegment[] = [];
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      currentPath += '/' + parts[i];
      const isLast = i === parts.length - 1;

      let label = parts[i];
      // Dynamic route segments like [id] → "Detail"
      if (label.startsWith('[') && label.endsWith(']')) {
        label = 'Detail';
      }

      // Humanise: replace hyphens, capitalise each word
      label = label
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

      crumbs.push({
        label,
        href: isLast ? undefined : currentPath,
      });
    }

    return crumbs;
  }, [pathname, segments]);

  // Don't render breadcrumbs on the home page itself
  if (pathname === '/') return null;

  return (
    <nav aria-label="Breadcrumb" className="breadcrumb-nav">
      <ol className="breadcrumb-list">
        {/* Home link — always rendered as the first crumb */}
        <li className="breadcrumb-item">
          <Link href="/dashboard" className="breadcrumb-link breadcrumb-home">
            <svg
              className="breadcrumb-home-icon"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span>{homeLabel}</span>
          </Link>
        </li>

        {items.map((item, index) => {
          const isCurrent = !item.href;

          return (
            <li key={`${item.label}-${index}`} className="breadcrumb-item">
              <span className="breadcrumb-separator" aria-hidden="true">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </span>

              {isCurrent ? (
                <span className="breadcrumb-current" aria-current="page">
                  {item.label}
                </span>
              ) : (
                <Link href={item.href!} className="breadcrumb-link">
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
