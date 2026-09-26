import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  getConfiguredApiKey,
  extractBearerToken,
  timingSafeStringEqual,
  validateWebhookApiKey,
} from './api-key-auth';

// ─── helpers ───────────────────────────────────────────────────────────────

function makeRequest(method = 'GET', headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/webhooks', { method, headers });
}

// ─── getConfiguredApiKey ───────────────────────────────────────────────────

describe('getConfiguredApiKey', () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env.CRASHLAB_WEBHOOK_API_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.CRASHLAB_WEBHOOK_API_KEY;
    } else {
      process.env.CRASHLAB_WEBHOOK_API_KEY = originalKey;
    }
  });

  it('returns undefined when the env var is not set', () => {
    delete process.env.CRASHLAB_WEBHOOK_API_KEY;
    expect(getConfiguredApiKey()).toBeUndefined();
  });

  it('returns undefined when the env var is an empty string', () => {
    process.env.CRASHLAB_WEBHOOK_API_KEY = '';
    expect(getConfiguredApiKey()).toBeUndefined();
  });

  it('returns undefined when the env var is only whitespace', () => {
    process.env.CRASHLAB_WEBHOOK_API_KEY = '   ';
    expect(getConfiguredApiKey()).toBeUndefined();
  });

  it('returns the trimmed value when the env var is set', () => {
    process.env.CRASHLAB_WEBHOOK_API_KEY = 'super-secret-key';
    expect(getConfiguredApiKey()).toBe('super-secret-key');
  });

  it('trims surrounding whitespace from the env var value', () => {
    process.env.CRASHLAB_WEBHOOK_API_KEY = '  secret  ';
    expect(getConfiguredApiKey()).toBe('secret');
  });
});

// ─── extractBearerToken ────────────────────────────────────────────────────

describe('extractBearerToken', () => {
  it('returns undefined when no Authorization header is present', () => {
    expect(extractBearerToken(makeRequest())).toBeUndefined();
  });

  it('returns undefined for a Basic auth header', () => {
    expect(
      extractBearerToken(makeRequest('GET', { authorization: 'Basic dXNlcjpwYXNz' })),
    ).toBeUndefined();
  });

  it('returns undefined for a malformed header with too many parts', () => {
    expect(
      extractBearerToken(makeRequest('GET', { authorization: 'Bearer token extra' })),
    ).toBeUndefined();
  });

  it('returns undefined when the token part is empty', () => {
    expect(extractBearerToken(makeRequest('GET', { authorization: 'Bearer ' }))).toBeUndefined();
  });

  it('returns the token for a well-formed Bearer header', () => {
    expect(
      extractBearerToken(makeRequest('GET', { authorization: 'Bearer my-api-key' })),
    ).toBe('my-api-key');
  });

  it('is case-insensitive for the "Bearer" scheme', () => {
    expect(
      extractBearerToken(makeRequest('GET', { authorization: 'BEARER my-api-key' })),
    ).toBe('my-api-key');
    expect(
      extractBearerToken(makeRequest('GET', { authorization: 'bearer my-api-key' })),
    ).toBe('my-api-key');
  });
});

// ─── timingSafeStringEqual ──────────────────────────────────────────────────

describe('timingSafeStringEqual', () => {
  it('returns true for two identical strings', () => {
    expect(timingSafeStringEqual('abc', 'abc')).toBe(true);
  });

  it('returns false for strings that differ by one character', () => {
    expect(timingSafeStringEqual('abcd', 'abce')).toBe(false);
  });

  it('returns false for strings with different lengths', () => {
    expect(timingSafeStringEqual('short', 'longer-value')).toBe(false);
  });

  it('returns false when one string is empty and the other is not', () => {
    expect(timingSafeStringEqual('', 'nonempty')).toBe(false);
    expect(timingSafeStringEqual('nonempty', '')).toBe(false);
  });

  it('returns true for two empty strings', () => {
    expect(timingSafeStringEqual('', '')).toBe(true);
  });

  it('handles strings with special characters', () => {
    const key = 'sk_live_abc123!@#$%^&*()';
    expect(timingSafeStringEqual(key, key)).toBe(true);
    expect(timingSafeStringEqual(key, key + '!')).toBe(false);
  });
});

// ─── validateWebhookApiKey ──────────────────────────────────────────────────

describe('validateWebhookApiKey', () => {
  let originalKey: string | undefined;
  let originalAllow: string | undefined;

  beforeEach(() => {
    originalKey = process.env.CRASHLAB_WEBHOOK_API_KEY;
    originalAllow = process.env.CRASHLAB_ALLOW_UNAUTHENTICATED_WEBHOOKS;
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.CRASHLAB_WEBHOOK_API_KEY;
    } else {
      process.env.CRASHLAB_WEBHOOK_API_KEY = originalKey;
    }
    if (originalAllow === undefined) {
      delete process.env.CRASHLAB_ALLOW_UNAUTHENTICATED_WEBHOOKS;
    } else {
      process.env.CRASHLAB_ALLOW_UNAUTHENTICATED_WEBHOOKS = originalAllow;
    }
  });

  describe('when no API key is configured and no escape hatch', () => {
    beforeEach(() => {
      delete process.env.CRASHLAB_WEBHOOK_API_KEY;
      delete process.env.CRASHLAB_ALLOW_UNAUTHENTICATED_WEBHOOKS;
    });

    it('allows GET requests without an Authorization header', () => {
      const result = validateWebhookApiKey(makeRequest('GET'));
      expect(result).toBeUndefined();
    });

    it('rejects POST requests without an Authorization header with 503', async () => {
      const result = validateWebhookApiKey(makeRequest('POST'));
      expect(result).not.toBeUndefined();
      expect(result!.status).toBe(503);
      const body = await result!.json();
      expect(body.error).toMatch(/Webhook authentication is not configured/i);
      expect(body.code).toBe('WEBHOOK_AUTH_NOT_CONFIGURED');
    });

    it('rejects PUT, PATCH, DELETE requests without an Authorization header with 503', async () => {
      for (const method of ['PUT', 'PATCH', 'DELETE']) {
        const result = validateWebhookApiKey(makeRequest(method));
        expect(result).not.toBeUndefined();
        expect(result!.status).toBe(503);
      }
    });
  });

  describe('when no API key is configured but escape hatch is enabled', () => {
    beforeEach(() => {
      delete process.env.CRASHLAB_WEBHOOK_API_KEY;
      process.env.CRASHLAB_ALLOW_UNAUTHENTICATED_WEBHOOKS = '1';
    });

    it('allows POST requests without an Authorization header', () => {
      const result = validateWebhookApiKey(makeRequest('POST'));
      expect(result).toBeUndefined();
    });
  });

  describe('when an API key is configured', () => {
    const VALID_KEY = 'test-api-key-secret';

    beforeEach(() => {
      process.env.CRASHLAB_WEBHOOK_API_KEY = VALID_KEY;
      delete process.env.CRASHLAB_ALLOW_UNAUTHENTICATED_WEBHOOKS;
    });

    it('returns undefined when the correct Bearer token is provided for GET and POST', () => {
      expect(
        validateWebhookApiKey(makeRequest('GET', { authorization: `Bearer ${VALID_KEY}` })),
      ).toBeUndefined();
      expect(
        validateWebhookApiKey(makeRequest('POST', { authorization: `Bearer ${VALID_KEY}` })),
      ).toBeUndefined();
    });

    it('returns a 401 response when no Authorization header is present on POST', async () => {
      const result = validateWebhookApiKey(makeRequest('POST'));
      expect(result).not.toBeUndefined();
      expect(result!.status).toBe(401);
      const body = await result!.json();
      expect(body.error).toMatch(/Authentication required/i);
    });

    it('returns a 401 response when the token is wrong', async () => {
      const result = validateWebhookApiKey(
        makeRequest('POST', { authorization: 'Bearer wrong-key' }),
      );
      expect(result).not.toBeUndefined();
      expect(result!.status).toBe(401);
      const body = await result!.json();
      expect(body.error).toMatch(/Invalid API key/i);
    });
  });
});
