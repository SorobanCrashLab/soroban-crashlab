import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import * as Sentry from '@sentry/nextjs';
import { initSentryClient, sentryAdapter } from './sentry-client';

vi.mock('@sentry/nextjs', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

describe('Sentry Client Integration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    // Suppress console output during tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should call Sentry.init when DSN is present', () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://mock-dsn@sentry.io/1';
    initSentryClient();
    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({
      dsn: 'https://mock-dsn@sentry.io/1',
      tracesSampleRate: 1.0,
    }));
  });

  it('should NOT call Sentry.init when DSN is missing', () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    initSentryClient();
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('should delegate captureException to Sentry when DSN is present', () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://mock-dsn@sentry.io/1';
    const error = new Error('Test Error');
    sentryAdapter.captureException(error);
    expect(Sentry.captureException).toHaveBeenCalledWith(error, expect.any(Object));
  });

  it('should log to console.error when captureException is called and DSN is missing', () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    const error = new Error('Test Error');
    sentryAdapter.captureException(error);
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it('should delegate captureMessage to Sentry when DSN is present', () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://mock-dsn@sentry.io/1';
    sentryAdapter.captureMessage('test message', 'warning');
    expect(Sentry.captureMessage).toHaveBeenCalledWith('test message', 'warning');
  });
});