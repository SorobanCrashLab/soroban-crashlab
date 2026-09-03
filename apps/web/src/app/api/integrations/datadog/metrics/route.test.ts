/**
 * Tests for Datadog metrics API route
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { GET } from './route';

describe('GET /api/integrations/datadog/metrics', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns metrics configuration when Datadog is enabled', async () => {
    process.env.DATADOG_ENABLED = 'true';
    process.env.DATADOG_AGENT_HOST = 'datadog.example.com';
    process.env.DATADOG_AGENT_PORT = '8125';
    process.env.NODE_ENV = 'production';

    const request = new Request('http://localhost/api/integrations/datadog/metrics');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.enabled).toBe(true);
    expect(data.data.config.agentHost).toBe('datadog.example.com');
    expect(data.data.config.agentPort).toBe(8125);
    expect(data.data.config.prefix).toBe('soroban_crashlab.');
    expect(data.data.config.globalTags.env).toBe('production');
    expect(data.data.config.globalTags.service).toBe('soroban-crashlab-backend');
    expect(data.data.status).toBe('active');
    expect(data.data.timestamp).toBeDefined();
  });

  it('returns mock status when Datadog is disabled', async () => {
    process.env.DATADOG_ENABLED = 'false';
    process.env.NODE_ENV = 'development';

    const request = new Request('http://localhost/api/integrations/datadog/metrics');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.enabled).toBe(false);
    expect(data.data.status).toBe('mock');
    expect(data.data.config.globalTags.env).toBe('development');
  });

  it('uses default values when environment variables are not set', async () => {
    delete process.env.DATADOG_ENABLED;
    delete process.env.DATADOG_AGENT_HOST;
    delete process.env.DATADOG_AGENT_PORT;
    delete process.env.NODE_ENV;

    const request = new Request('http://localhost/api/integrations/datadog/metrics');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.enabled).toBe(false);
    expect(data.data.config.agentHost).toBe('localhost');
    expect(data.data.config.agentPort).toBe(8125);
    expect(data.data.config.globalTags.env).toBe('development');
  });

  it('returns valid JSON structure', async () => {
    const request = new Request('http://localhost/api/integrations/datadog/metrics');
    const response = await GET(request);
    const data = await response.json();

    expect(data.data).toHaveProperty('enabled');
    expect(data.data).toHaveProperty('config');
    expect(data.data).toHaveProperty('status');
    expect(data.data).toHaveProperty('timestamp');
    expect(data.data.config).toHaveProperty('agentHost');
    expect(data.data.config).toHaveProperty('agentPort');
    expect(data.data.config).toHaveProperty('prefix');
    expect(data.data.config).toHaveProperty('globalTags');
  });
});
