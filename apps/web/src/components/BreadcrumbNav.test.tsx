import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BreadcrumbNav from './BreadcrumbNav';

/**
 * Route segments fed to `usePathname` during the auto-derivation tests.
 */
const PATHNAMES = {
  nested: '/settings/alerting',
  deep: '/runs/run-123/replay-history',
  humanised: '/custom-run-details',
};

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(() => '/'),
}));

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
}));

// Render `next/link` as a plain anchor so BreadcrumbNav can be SSR'd with
// `renderToStaticMarkup` outside of a running Next.js app.
vi.mock('next/link', async () => {
  const React = await import('react');
  return {
    default: (props: {
      href: string;
      children?: React.ReactNode;
      className?: string;
    }) => React.createElement('a', props),
  };
});

describe('BreadcrumbNav', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue(PATHNAMES.nested);
  });

  it('renders a Breadcrumb landmark with a Dashboard home crumb', () => {
    const html = renderToStaticMarkup(<BreadcrumbNav />);

    expect(html).toContain('<nav aria-label="Breadcrumb"');
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('<span>Dashboard</span>');
    expect(html).toContain('breadcrumb-home');
  });

  it('renders custom segments and marks the last as the current page', () => {
    const html = renderToStaticMarkup(
      <BreadcrumbNav
        segments={[
          { label: 'Runs', href: '/runs' },
          { label: 'Detail' },
        ]}
      />,
    );

    expect(html).toContain('href="/runs"');
    expect(html).toContain('>Runs</a>');

    // The last crumb has no href and is announced as the current page.
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('>Detail</span>');

    // Earlier crumbs with hrefs must not be marked current.
    expect(html).not.toContain('href="/runs" aria-current');
  });

  it('auto-derives breadcrumbs from the current path', () => {
    mockUsePathname.mockReturnValue(PATHNAMES.deep);

    const html = renderToStaticMarkup(<BreadcrumbNav />);

    // Dashboard > Runs > Run 123 > Replay History
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('>Replay History</span>');
    // Intermediate segments link to their accumulated path.
    expect(html).toContain('href="/runs"');
    expect(html).toContain('href="/runs/run-123"');
  });

  it('humanises kebab-case segment labels', () => {
    mockUsePathname.mockReturnValue(PATHNAMES.humanised);

    const html = renderToStaticMarkup(<BreadcrumbNav />);

    expect(html).toContain('Custom Run Details');
    expect(html).not.toContain('custom-run-details');
  });

  it('uses a custom home label and link target', () => {
    const html = renderToStaticMarkup(
      <BreadcrumbNav homeLabel="Console" />,
    );

    expect(html).toContain('<span>Console</span>');
  });

  it('renders nothing on the home page', () => {
    mockUsePathname.mockReturnValue('/');

    const html = renderToStaticMarkup(<BreadcrumbNav />);

    expect(html).toBe('');
  });
});