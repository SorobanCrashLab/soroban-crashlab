import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequireCapability } from './RequireCapability';
import {
  invalidateAccessCache,
  primeEffectiveAccess,
  type EffectiveAccess,
} from '../lib/permissions';

const { mockReplace } = vi.hoisted(() => ({ mockReplace: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/maintainer',
  useRouter: () => ({ replace: mockReplace }),
}));

function makeAccess(role: 'analyst' | 'maintainer'): EffectiveAccess {
  return {
    principal: {
      identityType: 'anonymous',
      identityValue: 'anonymous',
      subject: 'user:anon',
      authenticated: false,
    },
    role,
    capabilities: { canAnnotate: true, canAdminister: role === 'maintainer' },
    maintainerCount: 1,
    gitHubSessionsEnabled: false,
  };
}

beforeEach(() => {
  mockReplace.mockReset();
});

afterEach(() => {
  invalidateAccessCache();
});

describe('RequireCapability', () => {
  it('shows the loading fallback while access resolves', () => {
    const html = renderToStaticMarkup(
      <RequireCapability capability="settings:write" loading={<p>loading gate</p>}>
        <main>admin</main>
      </RequireCapability>,
    );

    expect(html).toContain('loading gate');
    expect(html).not.toContain('admin');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('renders children when the role holds the capability', () => {
    primeEffectiveAccess(makeAccess('maintainer'));

    const html = renderToStaticMarkup(
      <RequireCapability capability="settings:write">
        <main>admin</main>
      </RequireCapability>,
    );

    expect(html).toContain('admin');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('renders nothing (redirect pending) when the role lacks the capability', () => {
    primeEffectiveAccess(makeAccess('analyst'));

    const html = renderToStaticMarkup(
      <RequireCapability capability="settings:write">
        <main>admin</main>
      </RequireCapability>,
    );

    expect(html).toBe('');
  });

  it('honours the local-mode bypass without waiting for the role', () => {
    const html = renderToStaticMarkup(
      <RequireCapability capability="settings:write" bypass>
        <main>admin</main>
      </RequireCapability>,
    );

    expect(html).toContain('admin');
  });

  it('holds redirects while caller state is deferred', () => {
    const html = renderToStaticMarkup(
      <RequireCapability
        capability="settings:write"
        defer
        loading={<p>waiting on hydration</p>}
      >
        <main>admin</main>
      </RequireCapability>,
    );

    expect(html).toContain('waiting on hydration');
    expect(html).not.toContain('admin');
  });
});
