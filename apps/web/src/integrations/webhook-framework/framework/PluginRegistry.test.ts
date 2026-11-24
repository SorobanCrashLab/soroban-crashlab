/** Plugin registry, trigger matching, delivery and harness tests (#2204). */
import { describe, expect, it } from 'vitest';
import {
  PluginRegistry,
  TestCaseManager,
  matchesTrigger,
  runTestHarness,
  validateManifest,
} from './registry';
import type { PluginManifest, WebhookEvent } from './types';

const manifest: PluginManifest = {
  id: 'datadog-events',
  name: 'Datadog Events',
  version: '1.0.0',
  endpoint: 'https://api.datadoghq.com/api/v1/events',
  triggers: [{ events: ['crash.created'], filter: { 'payload.campaign': 'mainnet-fuzz' } }],
  transform: [{ kind: 'template', template: '{{payload.crash.type}}', as: 'title' }],
};

const crash: WebhookEvent = {
  type: 'crash.created',
  payload: { campaign: 'mainnet-fuzz', crash: { type: 'Reentrancy' } },
};

describe('manifest validation', () => {
  it('accepts a valid manifest', () => {
    expect(validateManifest(manifest)).toEqual([]);
  });

  it('rejects invalid ids, versions and endpoints', () => {
    const errors = validateManifest({ ...manifest, id: 'Bad ID', version: 'x', endpoint: 'ftp://x' });
    expect(errors).toHaveLength(3);
  });
});

describe('trigger matching', () => {
  it('matches event type and filters', () => {
    expect(matchesTrigger(manifest.triggers[0], crash)).toBe(true);
    expect(
      matchesTrigger(manifest.triggers[0], { ...crash, payload: { campaign: 'staging' } }),
    ).toBe(false);
    expect(matchesTrigger(manifest.triggers[0], { ...crash, type: 'run.completed' })).toBe(false);
  });
});

describe('PluginRegistry', () => {
  it('registers, lists and unregisters plugins', () => {
    const registry = new PluginRegistry();
    registry.register(manifest);
    expect(registry.list()).toHaveLength(1);
    expect(() => registry.register(manifest)).toThrow(/already registered/);
    expect(registry.unregister(manifest.id)).toBe(true);
    expect(registry.list()).toHaveLength(0);
  });

  it('selects only matching, enabled plugins', () => {
    const registry = new PluginRegistry();
    registry.register(manifest);
    expect(registry.matching(crash)).toHaveLength(1);
    registry.setEnabled(manifest.id, false);
    expect(registry.matching(crash)).toHaveLength(0);
  });

  it('transforms events via the plugin transform', () => {
    const plugin = new PluginRegistry().register(manifest);
    expect(plugin.transform(crash)).toEqual({ title: 'Reentrancy' });
  });
});

describe('test harness', () => {
  it('delivers the transformed body and records results', async () => {
    const plugin = new PluginRegistry().register(manifest);
    const fetchImpl = async () => ({ status: 202 });
    const result = await runTestHarness(plugin, crash, fetchImpl);
    expect(result.transformed).toEqual({ title: 'Reentrancy' });
    expect(JSON.parse(result.request.body)).toEqual({ title: 'Reentrancy' });
    expect(result.result).toMatchObject({ ok: true, status: 202 });
  });

  it('reports delivery failures', async () => {
    const plugin = new PluginRegistry().register(manifest);
    const result = await runTestHarness(plugin, crash, async () => ({ status: 500 }));
    expect(result.result.ok).toBe(false);
    expect(result.result.status).toBe(500);
  });

  it('saves and lists test cases', () => {
    const manager = new TestCaseManager();
    manager.save({ name: 'reentrancy', pluginId: manifest.id, event: crash, createdAt: 'now' });
    expect(manager.list(manifest.id)).toHaveLength(1);
    expect(manager.remove(manifest.id, 'reentrancy')).toBe(true);
    expect(manager.list()).toHaveLength(0);
  });
});
