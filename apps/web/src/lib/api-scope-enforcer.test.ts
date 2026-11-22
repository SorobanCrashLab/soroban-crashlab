import { describe, it, expect } from 'vitest';
import {
  getRequiredScopesForRequest,
  hasSufficientScope,
  checkScopePermission,
} from './api-scope-enforcer';
import type { ApiTokenScope } from './storage/api-token-store';

describe('API Scope Enforcer', () => {
  it('should determine required scopes for webhook operations', () => {
    const readScopes = getRequiredScopesForRequest('GET', '/api/webhooks/123');
    expect(readScopes).toContain('webhook:read');

    const writeScopes = getRequiredScopesForRequest('POST', '/api/webhooks');
    expect(writeScopes).toContain('webhook:write');
  });

  it('should determine required scopes for runs operations', () => {
    const readScopes = getRequiredScopesForRequest('GET', '/api/runs');
    expect(readScopes).toContain('runs:read');

    const writeScopes = getRequiredScopesForRequest('DELETE', '/api/runs/123');
    expect(writeScopes).toContain('runs:write');
  });

  it('should determine required scopes for settings operations', () => {
    const readScopes = getRequiredScopesForRequest('GET', '/api/settings');
    expect(readScopes).toContain('settings:read');

    const writeScopes = getRequiredScopesForRequest('PUT', '/api/settings/config');
    expect(writeScopes).toContain('settings:write');
  });

  it('should return null for unspecified routes', () => {
    const scopes = getRequiredScopesForRequest('GET', '/api/unknown');
    expect(scopes).toBeNull();
  });

  it('should check if wildcard scope is sufficient', () => {
    const wildcard: ApiTokenScope[] = ['*'];
    expect(hasSufficientScope(wildcard, ['webhook:read'])).toBe(true);
    expect(hasSufficientScope(wildcard, ['runs:write'])).toBe(true);
  });

  it('should check if specific scopes are sufficient', () => {
    const scopes: ApiTokenScope[] = ['webhook:read', 'runs:read'];
    expect(hasSufficientScope(scopes, ['webhook:read'])).toBe(true);
    expect(hasSufficientScope(scopes, ['webhook:write'])).toBe(false);
    expect(hasSufficientScope(scopes, ['runs:read'])).toBe(true);
  });

  it('should enforce scope permissions', () => {
    const scopes: ApiTokenScope[] = ['webhook:read'];

    const getResult = checkScopePermission(scopes, 'GET', '/api/webhooks');
    expect(getResult.allowed).toBe(true);

    const postResult = checkScopePermission(scopes, 'POST', '/api/webhooks');
    expect(postResult.allowed).toBe(false);
  });

  it('should allow requests with no scope requirement', () => {
    const scopes: ApiTokenScope[] = ['webhook:read'];

    const result = checkScopePermission(scopes, 'GET', '/api/unknown');
    expect(result.allowed).toBe(true);
    expect(result.requiredScopes).toBeNull();
  });
});
