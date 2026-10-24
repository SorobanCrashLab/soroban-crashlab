import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { Can } from './Can';
import {
  invalidateAccessCache,
  primeEffectiveAccess,
  type EffectiveAccess,
} from '../lib/permissions';

function makeAccess(role: 'analyst' | 'maintainer'): EffectiveAccess {
  return {
    principal: {
      identityType: 'anonymous',
      identityValue: 'anonymous',
      subject: 'api-key:ci',
      authenticated: role === 'maintainer',
    },
    role,
    capabilities: { canAnnotate: true, canAdminister: role === 'maintainer' },
    maintainerCount: 1,
    gitHubSessionsEnabled: false,
  };
}

afterEach(() => {
  invalidateAccessCache();
});

describe('Can — disabled mode (default explanation)', () => {
  it('denies by default while access is still loading', () => {
    const html = renderToStaticMarkup(
      <Can capability="runs:replay" mode="disabled">
        <button type="button">Run seed replay</button>
      </Can>,
    );

    expect(html).toContain('disabled');
    expect(html).toContain('Verifying your access to Replay crashes…');
    expect(html).toContain('data-gate-disabled="runs:replay"');
  });

  it('renders children untouched when the role holds the capability', () => {
    primeEffectiveAccess(makeAccess('maintainer'));

    const html = renderToStaticMarkup(
      <Can capability="runs:replay" mode="disabled">
        <button type="button" className="replay-btn">Run seed replay</button>
      </Can>,
    );

    expect(html).not.toContain('disabled');
    expect(html).not.toContain('data-gate-disabled');
    expect(html).not.toContain('gate-note');
    expect(html).toContain('class="replay-btn"');
  });

  it('disables, explains and describes the control for a denied role', () => {
    primeEffectiveAccess(makeAccess('analyst'));

    const html = renderToStaticMarkup(
      <Can capability="runs:replay" mode="disabled">
        <button type="button" className="replay-btn">Run seed replay</button>
      </Can>,
    );

    expect(html).toContain('disabled');
    expect(html).toContain('data-gate-disabled="runs:replay"');
    expect(html).toContain('title="Replay crashes (runs:replay) requires the maintainer role.');
    expect(html).toMatch(/aria-describedby="[^"]+"/);
    expect(html).toContain('data-testid="gate-note-runs:replay"');
    expect(html).toContain('requires the maintainer role');
    expect(html).toContain('class="replay-btn"');
  });

  it('can point at an external note instead of rendering its own', () => {
    primeEffectiveAccess(makeAccess('analyst'));

    const html = renderToStaticMarkup(
      <Can
        capability="tokens:manage"
        mode="disabled"
        showNote={false}
        describedBy="tokens-gate-note"
      >
        <button type="button">Create API Token</button>
      </Can>,
    );

    expect(html).toContain('disabled');
    expect(html).toContain('aria-describedby="tokens-gate-note"');
    expect(html).not.toContain('gate-note-tokens:manage');
  });

  it('supports a render prop so callers can style the denied state', () => {
    primeEffectiveAccess(makeAccess('analyst'));

    const html = renderToStaticMarkup(
      <Can capability="settings:write" mode="disabled">
        {(gate) => (
          <button type="button" className={gate.disabled ? 'is-off' : 'is-on'}>
            {gate.allowed ? 'Save' : gate.reason}
          </button>
        )}
      </Can>,
    );

    expect(html).toContain('class="is-off"');
    expect(html).toContain('requires the maintainer role');
  });
});

describe('Can — hidden mode', () => {
  it('renders the fallback (or nothing) when denied', () => {
    primeEffectiveAccess(makeAccess('analyst'));

    const html = renderToStaticMarkup(
      <Can capability="runs:delete" fallback={<span>locked</span>}>
        <button type="button">Delete</button>
      </Can>,
    );

    expect(html).toContain('locked');
    expect(html).not.toContain('Delete');
  });

  it('renders children when allowed', () => {
    primeEffectiveAccess(makeAccess('maintainer'));

    const html = renderToStaticMarkup(
      <Can capability="runs:delete">
        <button type="button">Delete</button>
      </Can>,
    );

    expect(html).toContain('Delete');
    expect(html).not.toContain('locked');
  });
});
