import { describe, it, expect } from 'vitest';
import { safeRedirect, safeRedirectPath } from './safe-redirect';

describe('safeRedirect', () => {
  describe('attack vectors rejected', () => {
    const attackVectors: Array<[string, string]> = [
      ['absolute https', 'https://evil.com'],
      ['absolute http', 'http://evil.com'],
      ['absolute javascript', 'javascript:alert(1)'],
      ['absolute data', 'data:text/html,<script>alert(1)</script>'],
      ['protocol-relative', '//evil.com'],
      ['protocol-relative with path', '//evil.com/runs/1'],
      ['triple slash', '///evil.com'],
      ['backslash', '\\evil.com'],
      ['backsla-sh slash', '/\\evil.com'],
      ['double backslash', '\\\\evil.com'],
      ['encoded backslash', '/%5cevil.com'],
      ['encoded backslash uppercase', '/%5Cevil.com'],
      ['encoded slash', '/%2f%2fevil.com'],
      ['encoded slash uppercase', '/%2F%2Fevil.com'],
      ['at sign authority', '/user@evil.com'],
      ['encoded at sign', '/%40evil.com'],
      ['newline', '/\nevil.com'],
      ['carriage return', '/\revil.com'],
      ['tab', '/\tevil.com'],
      ['null byte', '/\u0003evil.com'],
      ['unicode fraction slash', '/\u2044evil.com'],
      ['unicode division slash', '/\u2215evil.com'],
      ['unicode reverse solidus', '/\u2216evil.com'],
      ['raw traversal', '/../evil.com'],
      ['encoded traversal', '/%2e%2e/evil.com'],
      ['leading whitespace', ' //evil.com'],
      ['trailing whitespace', '//evil.com '],
      ['not root relative', 'evil.com'],
      ['relative without slash', 'runs/1'],
      ['empty', ''],
    ];

    it.each(attackVectors)('rejects %s', (_label, input) => {
      const result = safeRedirect(input);
      expect(result.ok).toBe(false);
      expect(result.path).toBe('/');
    });
  });

  describe('legitimate deep links accepted', () => {
    const legitimate: Array<[string, string]> = [
      ['root', '/'],
      ['runs list', '/runs'],
      ['run detail', '/runs/123'],
      ['run detail with query', '/runs/123?tab=logs'],
      ['settings', '/settings/profile'],
      ['invite accept','/invite/accept?token=abc123'],
      ['dashboard', '/dashboard'],
      ['nested path', '/org/acme/runs/456'],
      ['path with hyphens', '/runs/my-run-1'],
      ['path with underscores', '/runs/my_run_1'],
    ];

    it.each(legitimate)('accepts %s', (_label, input) => {
      const result = safeRedirect(input);
      expect(result.ok).toBe(true);
      expect(result.path).toBe(input);
    });
  });

  describe('path prefix allowlist', () => {
    const options = { allowedPrefixes: ['/runs/'] };

    it('accepts paths under the allowed prefix', () => {
      const result = safeRedirect('/runs/123', options);
      expect(result.ok).toBe(true);
      expect(result.path).toBe('/runs/123');
    });

    it('rejects paths outside the allowed prefix', () => {
      const result = safeRedirect('/settings', options);
      expect(result.ok).toBe(false);
      expect(result.path).toBe('/');
      expect(result.reason).toBe('prefix_not_allowed');
    });

    it('rejects traversal escaping the prefix', () => {
      const result = safeRedirect('/runs/../../settings', options);
      expect(result.ok).toBe(false);
      expect(result.path).toBe('/');
    });
  });

  describe('fallback behavior', () => {
    it('returns the default fallback for null', () => {
      const result = safeRedirect(null);
      expect(result).toEqual({ path: '/', ok: false, reason: 'missing' });
    });

    it('returns the default fallback for undefined', () => {
      const result = safeRedirect(undefined);
      expect(result.path).toBe('/');
      expect(result.ok).toBe(false);
    });

    it('respects a custom fallback', () => {
      const result = safeRedirect('https://evil.com', { fallback: '/dashboard' });
      expect(result.path).toBe('/dashboard');
      expect(result.ok).toBe(false);
    });
  });

  describe('safeRedirectPath', () => {
    it('returns the path for a valid input', () => {
      expect(safeRedirectPath('/runs/1')).toBe('/runs/1');
    });

    it('returns the fallback for an invalid input', () => {
      expect(safeRedirectPath('//evil.com')).toBe('/');
    });
  });
});
