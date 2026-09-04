import { describe, expect, it } from 'vitest';
import { ApiError } from './api-client';
import { toUserMessage } from './api-error-mapper';
import { HttpError } from './request-dedup';

describe('toUserMessage', () => {
  it('maps network errors without exposing URLs or raw exception text', () => {
    const fetchErr = new TypeError('Failed to fetch from http://internal-proxy.cluster.local:8080/api');
    const msg = toUserMessage(fetchErr);
    expect(msg).toBe('Unable to connect to the server. Please check your network connection and try again.');
    expect(msg).not.toContain('http://internal-proxy.cluster.local');
  });

  it('maps auth errors for 401/403 status', () => {
    const err = new ApiError(403, 'Access Denied for http://internal-admin.local');
    const msg = toUserMessage(err);
    expect(msg).toBe('Authentication required or access denied. Please verify your permissions.');
    expect(msg).not.toContain('http://internal-admin.local');
  });

  it('maps server errors for 500 status', () => {
    const err = new HttpError(500);
    const msg = toUserMessage(err);
    expect(msg).toBe('Server error encountered. Please try again later.');
  });

  it('maps validation errors for 400 status', () => {
    const err = new ApiError(400, 'Invalid parameter');
    const msg = toUserMessage(err);
    expect(msg).toBe('Invalid request data. Please check your input and try again.');
  });

  it('sanitizes internal URLs from generic fallback messages', () => {
    const msg = toUserMessage(new Error('Unknown crash'), 'Error connecting to http://10.0.0.1:3000/v1');
    expect(msg).not.toContain('http://10.0.0.1:3000/v1');
    expect(msg).toContain('[server]');
  });

  it('provides safe generic message for unknown error classes', () => {
    const msg = toUserMessage({ custom: 'opaque object' });
    expect(msg).toBe('An unexpected error occurred. Please try again.');
  });
});
