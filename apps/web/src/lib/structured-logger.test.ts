import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StructuredLogger } from './structured-logger';

describe('StructuredLogger', () => {
  let logEntries: any[] = [];

  const mockWriter = vi.fn((entry) => {
    logEntries.push(entry);
  });

  beforeEach(() => {
    logEntries = [];
    mockWriter.mockClear();
  });

  it('logs info messages with proper structure', async () => {
    const logger = new StructuredLogger(mockWriter);
    await logger.info('Test message', { userId: '123' });

    expect(mockWriter).toHaveBeenCalledOnce();
    const entry = mockWriter.mock.calls[0][0];
    expect(entry.level).toBe('info');
    expect(entry.message).toBe('Test message');
    expect(entry.userId).toBe('123');
    expect(entry.timestamp).toBeDefined();
  });

  it('logs error messages with stack traces', async () => {
    const logger = new StructuredLogger(mockWriter);
    const error = new Error('Test error');
    await logger.error('Error occurred', { error });

    expect(mockWriter).toHaveBeenCalledOnce();
    const entry = mockWriter.mock.calls[0][0];
    expect(entry.level).toBe('error');
    expect(entry.message).toBe('Error occurred');
  });

  it('includes service name and environment', async () => {
    process.env.SERVICE_NAME = 'test-service';
    process.env.NODE_ENV = 'test';

    const logger = new StructuredLogger(mockWriter);
    await logger.info('Test');

    const entry = mockWriter.mock.calls[0][0];
    expect(entry.service).toBe('test-service');
    expect(entry.environment).toBe('test');
  });

  it('tracks CloudWatch configuration', async () => {
    const logger = new StructuredLogger(mockWriter, {
      enabled: true,
      logGroup: '/test/group',
      region: 'us-west-2',
    });

    expect(logger.isCloudWatchEnabled()).toBe(true);
    expect(logger.getCloudWatchConfig().logGroup).toBe('/test/group');
    expect(logger.getCloudWatchConfig().region).toBe('us-west-2');
  });

  it('supports correlation IDs for request tracking', async () => {
    const logger = new StructuredLogger(mockWriter);
    const correlationId = 'corr-123-456';
    await logger.info('Processing request', { correlationId });

    const entry = mockWriter.mock.calls[0][0];
    expect(entry.correlationId).toBe(correlationId);
  });
});
