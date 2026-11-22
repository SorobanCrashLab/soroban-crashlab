/**
 * Catalog integrity tests for issue #1387.
 *
 * Guards:
 *   1. Every code string is unique across the catalog.
 *   2. Every httpStatus is in the 4xx–5xx range.
 *   3. Every message is a non-empty string.
 *   4. codedErrorResponse emits { error, code } with the correct HTTP status.
 */

import { describe, it, expect } from 'vitest';
import { ERROR_CODES, codedErrorResponse, type ErrorCode } from './error-codes';

const entries = Object.values(ERROR_CODES);

describe('error catalog integrity', () => {
  it('has no duplicate code strings', () => {
    const codes = entries.map((e) => e.code);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });

  it('every httpStatus is a 4xx or 5xx integer', () => {
    for (const entry of entries) {
      expect(Number.isInteger(entry.httpStatus)).toBe(true);
      expect(entry.httpStatus).toBeGreaterThanOrEqual(400);
      expect(entry.httpStatus).toBeLessThan(600);
    }
  });

  it('every message is a non-empty string', () => {
    for (const entry of entries) {
      expect(typeof entry.message).toBe('string');
      expect(entry.message.length).toBeGreaterThan(0);
    }
  });

  it('every catalog key matches its code field', () => {
    for (const [key, entry] of Object.entries(ERROR_CODES)) {
      expect(entry.code).toBe(key);
    }
  });
});

describe('codedErrorResponse', () => {
  it('returns the catalog default message and httpStatus', async () => {
    const res = codedErrorResponse('RUN_NOT_FOUND');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe(ERROR_CODES.RUN_NOT_FOUND.message);
    expect(body.code).toBe('RUN_NOT_FOUND');
  });

  it('allows overriding the message while preserving code and status', async () => {
    const res = codedErrorResponse('WEBHOOK_DELIVERY_NOT_FOUND', 'Custom message here.');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Custom message here.');
    expect(body.code).toBe('WEBHOOK_DELIVERY_NOT_FOUND');
  });

  it('emits the code field on every catalog entry', async () => {
    for (const key of Object.keys(ERROR_CODES) as ErrorCode[]) {
      const res = codedErrorResponse(key);
      const body = await res.json();
      expect(body.code).toBe(key);
      expect(res.status).toBe(ERROR_CODES[key].httpStatus);
    }
  });

  it('response shape is { error: string, code: string } — no extra fields', async () => {
    const res = codedErrorResponse('INTERNAL_ERROR');
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['code', 'error']);
  });
});
