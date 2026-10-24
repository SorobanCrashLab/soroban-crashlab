import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ForbiddenPage from './page';
import {
  invalidateAccessCache,
  primeEffectiveAccess,
  type EffectiveAccess,
} from '../../lib/permissions';

const { mockSearchParams, mockBack } = vi.hoisted(() => ({
  mockSearchParams: vi.fn(() => new URLSearchParams('')),
  mockBack: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: mockSearchParams,
  useRouter: () => ({ back: mockBack, replace: vi.fn(), push: vi.fn() }),
}));

// Render `next/link` as a plain anchor so the page can be SSR'd outside Next.
vi.mock('next/link', async () => {
  const React = await import('react');
  return {
    default: (props: { href: string; children?: React.ReactNode; className?: string }) => {
      const { href, children, className } = props;
      return React.createElement('a', { href, className }, children);
    },
  };
});

function makeAccess(role: 'analyst' | 'maintainer', authenticated = false): EffectiveAccess {
  return {
    principal: {
      identityType: 'anonymous',
      identityValue: 'anonymous',
      subject: 'user:anon-1234',
      authenticated,
    },
    role,
    capabilities: { canAnnotate: true, canAdminister: role === 'maintainer' },
    maintainerCount: 2,
    gitHubSessionsEnabled: false,
  };
}

afterEach(() => {
  invalidateAccessCache();
  mockSearchParams.mockReturnValue(new URLSearchParams(''));
});

function renderWith(query: string): string {
  mockSearchParams.mockReturnValue(new URLSearchParams(query));
  return renderToStaticMarkup(<ForbiddenPage />);
}

describe('403 recovery page', () => {
  it('explains the missing capability, the role and who to ask', () => {
    primeEffectiveAccess(makeAccess('analyst'));
    const html = renderWith('capability=settings:write&from=%2Fmaintainer');

    expect(html).toContain('Error 403');
    expect(html).toContain('Access denied');
    expect(html).toContain('data-testid="forbidden-capability"');
    expect(html).toMatch(/data-testid="forbidden-capability-label">\s*Administer settings/);
    expect(html).toMatch(/data-testid="forbidden-capability-code">\s*settings:write/);
    expect(html).toContain('requires the maintainer role');
    expect(html).toContain('you are signed in as');
    expect(html).toContain('data-testid="forbidden-required-role"');
    expect(html).toContain('2 maintainers');
    expect(html).toContain('user:anon-1234');
    expect(html).toContain('Settings → Roles');
    expect(html).toContain('data-testid="forbidden-from"');
    expect(html).toContain('/maintainer');
  });

  it('offers recovery actions: back button and home link', () => {
    primeEffectiveAccess(makeAccess('analyst'));
    const html = renderWith('capability=roles:manage&from=%2Fsettings%2Froles');

    expect(html).toContain('data-testid="forbidden-back"');
    expect(html).toContain('Go back');
    expect(html).toContain('Go home');
    expect(html).toContain('href="/"');
  });

  it('points anonymous callers at sign-in', () => {
    primeEffectiveAccess(makeAccess('analyst', false));
    const html = renderWith('capability=runs:replay');

    expect(html).toContain('browsing anonymously');
    expect(html).toContain('href="/auth/signin"');
  });

  it('does not suggest signing in when the caller is authenticated', () => {
    primeEffectiveAccess(makeAccess('analyst', true));
    const html = renderWith('capability=runs:replay');

    expect(html).not.toContain('browsing anonymously');
  });

  it('renders a generic explanation when no capability is supplied', () => {
    primeEffectiveAccess(makeAccess('analyst'));
    const html = renderWith('');

    expect(html).toContain('Access denied');
    expect(html).not.toContain('data-testid="forbidden-capability"');
    expect(html).toContain('data-testid="forbidden-request-access"');
  });

  it('falls back gracefully for a capability the deployment does not know', () => {
    primeEffectiveAccess(makeAccess('analyst'));
    const html = renderWith('capability=bogus%3Athing');

    expect(html).toContain('Access denied');
    expect(html).not.toContain('data-testid="forbidden-capability-label"');
  });
});
