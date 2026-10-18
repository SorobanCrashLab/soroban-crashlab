import {
  checkRequestSize,
  effectiveRequestBodyLimit,
  limitRequestBody,
  requestBodyFailureResponse,
  requestSizeConfigFor,
  standardSizeLimitResponse,
  RequestSizeLimitConfig,
} from './request-size-limits';
import { describe, it, expect, vi } from 'vitest';

describe('checkRequestSize', () => {
  const createRequest = (contentLength: number, contentType = 'application/json') => {
    return {
      headers: new Map([
        ['content-length', contentLength.toString()],
        ['content-type', contentType],
      ]),
    } as unknown as Request;
  };

  it('returns null for requests within size limit', () => {
    const request = createRequest(1024); // 1KB
    const result = checkRequestSize(request);
    expect(result).toBeNull();
  });

  it('returns null when content-length is missing', () => {
    const request = {
      headers: new Map([['content-type', 'application/json']]),
    } as unknown as Request;
    expect(checkRequestSize(request)).toBeNull();
  });

  it('returns null when content-length is not a number', () => {
    const request = {
      headers: new Map([
        ['content-length', 'abc'],
        ['content-type', 'application/json'],
      ]),
    } as unknown as Request;
    expect(checkRequestSize(request)).toBeNull();
  });

  it('rejects JSON requests exceeding maxJsonSize', () => {
    const config: RequestSizeLimitConfig = { maxJsonSize: 1024 };
    const request = createRequest(2048, 'application/json');
    const result = checkRequestSize(request, config);

    expect(result).not.toBeNull();
    expect(result?.status).toBe(413);
  });

  it('rejects plain bodies exceeding maxBodySize even when within maxJsonSize', () => {
    const config: RequestSizeLimitConfig = { maxJsonSize: 8192, maxBodySize: 1024 };
    const request = createRequest(2048, 'application/json');
    const result = checkRequestSize(request, config);

    expect(result?.status).toBe(413);
  });

  it('rejects form data exceeding maxFormDataSize', () => {
    const config: RequestSizeLimitConfig = { maxFormDataSize: 1024 };
    const request = createRequest(2048, 'multipart/form-data; boundary=something');
    const result = checkRequestSize(request, config);

    expect(result).not.toBeNull();
    expect(result?.status).toBe(413);
  });

  it('rejects requests exceeding maxBodySize', () => {
    const config: RequestSizeLimitConfig = { maxBodySize: 1024 };
    const request = createRequest(2048);
    const result = checkRequestSize(request, config);

    expect(result).not.toBeNull();
    expect(result?.status).toBe(413);
  });

  it('uses default config when not provided', () => {
    const request = createRequest(1024); // Well within default limits
    const result = checkRequestSize(request);
    expect(result).toBeNull();
  });

  it('emits a standardized 413 envelope with code and limits', async () => {
    const config: RequestSizeLimitConfig = { maxJsonSize: 1024, maxBodySize: 5242880 };
    const request = createRequest(2048, 'application/json');
    const result = checkRequestSize(request, config);

    expect(result?.status).toBe(413);
    const body = await result?.json();
    expect(body.code).toBe('PAYLOAD_TOO_LARGE');
    expect(body.limit).toBe(1024);
    expect(body.actual).toBe(2048);
    expect(typeof body.error).toBe('string');
  });
});

describe('standardSizeLimitResponse', () => {
  it('embeds code, limit and actual when provided', async () => {
    const res = standardSizeLimitResponse('too big', 500, 999);
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body).toEqual({
      error: 'too big',
      code: 'PAYLOAD_TOO_LARGE',
      limit: 500,
      actual: 999,
    });
  });

  it('omits limit/actual when absent', async () => {
    const res = standardSizeLimitResponse('too big');
    const body = await res.json();
    expect(body).toEqual({ error: 'too big', code: 'PAYLOAD_TOO_LARGE' });
    expect(Object.keys(body)).not.toContain('limit');
  });
});

describe('streaming request body limits', () => {
  it('aborts an unknown-length body as soon as its byte limit is crossed', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"x":'));
        controller.enqueue(new TextEncoder().encode('123}'));
        controller.close();
      },
    });
    const request = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    const guarded = limitRequestBody(request, { maxBodySize: 64, maxJsonSize: 8 });

    await expect(guarded.request.json()).rejects.toThrow(/maximum allowed size/);
    expect(guarded.failure()).toBe('too-large');
    expect(requestBodyFailureResponse(guarded.failure(), 8)?.status).toBe(413);
  });

  it('uses explicit larger form limits for artifact uploads and keeps JSON capped', () => {
    const upload = new Request('http://localhost/api/artifacts', {
      method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=x' },
    });
    const config = requestSizeConfigFor(upload);
    expect(effectiveRequestBodyLimit(upload, config)).toBe(20 * 1024 * 1024);

    const json = new Request('http://localhost/api/campaigns', {
      method: 'POST', headers: { 'content-type': 'application/json' },
    });
    expect(effectiveRequestBodyLimit(json, requestSizeConfigFor(json))).toBe(1024 * 1024);
  });

  it('aborts an idle upload with a request timeout', async () => {
    vi.useFakeTimers();
    try {
      const body = new ReadableStream<Uint8Array>({ start() {} });
      const request = new Request('http://localhost/api/test', {
        method: 'POST', body, duplex: 'half',
      } as RequestInit & { duplex: 'half' });
      const guarded = limitRequestBody(request, { maxBodySize: 64 });
      const read = guarded.request.text();
      await vi.advanceTimersByTimeAsync(10_001);

      await expect(read).rejects.toThrow(/idle too long/);
      expect(guarded.failure()).toBe('idle-timeout');
      expect(requestBodyFailureResponse(guarded.failure())?.status).toBe(408);
    } finally {
      vi.useRealTimers();
    }
  });
});
