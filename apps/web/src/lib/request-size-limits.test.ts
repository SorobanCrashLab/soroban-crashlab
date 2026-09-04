import { checkRequestSize, RequestSizeLimitConfig } from './request-size-limits';
import { describe, it, expect } from 'vitest';

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

  it('rejects JSON requests exceeding maxJsonSize', () => {
    const config: RequestSizeLimitConfig = { maxJsonSize: 1024 };
    const request = createRequest(2048, 'application/json');
    const result = checkRequestSize(request, config);

    expect(result).not.toBeNull();
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
});
