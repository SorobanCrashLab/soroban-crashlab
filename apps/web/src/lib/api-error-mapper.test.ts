import { describe, expect, it } from 'vitest';
import { ApiError } from './api-client';
import { toUserMessage, IntegrityError, integrityKindToSeverity } from './api-error-mapper';
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

  // #1885 — integrity error cases
  describe('IntegrityError', () => {
    it('maps corrupt kind to re-upload copy', () => {
      const err = new IntegrityError('corrupt', 'checksum mismatch', 'artifact-abc');
      const msg = toUserMessage(err);
      expect(msg).toBe(
        'Data integrity check failed. This artifact may be corrupted — please re-upload or contact support.',
      );
    });

    it('maps verify_failed kind to re-upload copy', () => {
      const err = new IntegrityError('verify_failed', 'verification failed');
      const msg = toUserMessage(err);
      expect(msg).toBe(
        'Data integrity check failed. This artifact may be corrupted — please re-upload or contact support.',
      );
    });

    it('maps degraded kind to storage-degraded copy', () => {
      const err = new IntegrityError('degraded', 'storage fallback active');
      const msg = toUserMessage(err);
      expect(msg).toBe(
        'Storage is currently degraded. Data may be incomplete. Please try again shortly.',
      );
    });

    it('retains artifactId on IntegrityError', () => {
      const err = new IntegrityError('corrupt', 'bad checksum', 'artifact-xyz');
      expect(err.artifactId).toBe('artifact-xyz');
      expect(err.kind).toBe('corrupt');
    });
  });

  it('maps raw "corrupt" message string to integrity copy', () => {
    const msg = toUserMessage(new Error('corrupt bundle detected'));
    expect(msg).toBe(
      'Data integrity check failed. This artifact may be corrupted — please re-upload or contact support.',
    );
  });

  it('maps raw "checksum" message string to integrity copy', () => {
    const msg = toUserMessage(new Error('checksum mismatch on upload'));
    expect(msg).toBe(
      'Data integrity check failed. This artifact may be corrupted — please re-upload or contact support.',
    );
  });
});

describe('integrityKindToSeverity', () => {
  it('maps corrupt → corrupt', () => {
    expect(integrityKindToSeverity('corrupt')).toBe('corrupt');
  });
  it('maps verify_failed → corrupt', () => {
    expect(integrityKindToSeverity('verify_failed')).toBe('corrupt');
  });
  it('maps degraded → degraded', () => {
    expect(integrityKindToSeverity('degraded')).toBe('degraded');
  });
});
