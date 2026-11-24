/** Plugin registry, trigger matching, delivery and test harness (#2204). */

import { runTransformPipeline } from './transform';
import type {
  DeliveryRequest,
  DeliveryResult,
  PluginManifest,
  TestCase,
  Trigger,
  WebhookEvent,
  WebhookPlugin,
} from './types';

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

/** Validate a plugin manifest without mutating it. */
export function validateManifest(manifest: PluginManifest): string[] {
  const errors: string[] = [];
  if (!ID_PATTERN.test(manifest.id)) errors.push('id must be a lowercase slug');
  if (!manifest.name.trim()) errors.push('name must not be empty');
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) errors.push('version must be semver');
  if (!/^https?:\/\//.test(manifest.endpoint)) errors.push('endpoint must be http(s)');
  if (!Array.isArray(manifest.triggers) || manifest.triggers.length === 0) {
    errors.push('at least one trigger is required');
  }
  return errors;
}

/** Match one trigger against an event (type + dotted-path equality filters). */
export function matchesTrigger(trigger: Trigger, event: WebhookEvent): boolean {
  if (!trigger.events.includes(event.type)) return false;
  for (const [path, expected] of Object.entries(trigger.filter ?? {})) {
    let value: unknown = event;
    for (const part of path.split('.')) {
      if (value === null || typeof value !== 'object') return false;
      value = (value as Record<string, unknown>)[part];
    }
    if (value !== expected) return false;
  }
  return true;
}

/** In-memory registry. All list/read methods return copies to avoid state leaks. */
export class PluginRegistry {
  private readonly plugins = new Map<string, WebhookPlugin>();

  register(manifest: PluginManifest): WebhookPlugin {
    const errors = validateManifest(manifest);
    if (errors.length > 0) throw new Error(`Invalid plugin manifest: ${errors.join('; ')}`);
    if (this.plugins.has(manifest.id)) throw new Error(`Plugin already registered: ${manifest.id}`);
    const copy: PluginManifest = JSON.parse(JSON.stringify(manifest)) as PluginManifest;
    const plugin: WebhookPlugin = {
      manifest: copy,
      transform: (event) => runTransformPipeline(event, copy.transform),
      deliver: (request, fetchImpl) => deliver(request, fetchImpl),
    };
    this.plugins.set(copy.id, plugin);
    return plugin;
  }

  get(id: string): WebhookPlugin | undefined {
    return this.plugins.get(id);
  }

  list(): WebhookPlugin[] {
    return [...this.plugins.values()];
  }

  setEnabled(id: string, enabled: boolean): void {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new Error(`Unknown plugin: ${id}`);
    plugin.manifest.enabled = enabled;
  }

  unregister(id: string): boolean {
    return this.plugins.delete(id);
  }

  /** Plugins whose triggers match the event and which are not disabled. */
  matching(event: WebhookEvent): WebhookPlugin[] {
    return this.list().filter(
      (plugin) =>
        plugin.manifest.enabled !== false &&
        plugin.manifest.triggers.some((trigger) => matchesTrigger(trigger, event)),
    );
  }
}

/** Deliver a webhook request using an injectable fetch implementation. */
export async function deliver(
  request: DeliveryRequest,
  fetchImpl?: (url: string, init: unknown) => Promise<{ status: number }>,
): Promise<DeliveryResult> {
  const started = Date.now();
  if (!fetchImpl) {
    return { ok: false, latencyMs: 0, error: 'No fetch implementation available' };
  }
  try {
    const response = await fetchImpl(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
    });
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Test harness: transform + deliver a sample event and record the outcome. */
export function runTestHarness(
  plugin: WebhookPlugin,
  event: WebhookEvent,
  fetchImpl?: (url: string, init: unknown) => Promise<{ status: number }>,
): Promise<{ transformed: Record<string, unknown>; request: DeliveryRequest; result: DeliveryResult }> {
  const transformed = plugin.transform(event);
  const request: DeliveryRequest = {
    url: plugin.manifest.endpoint,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(transformed),
  };
  return deliver(request, fetchImpl).then((result) => ({ transformed, request, result }));
}

/** In-memory saved test cases (save as regression test). */
export class TestCaseManager {
  private readonly cases = new Map<string, TestCase>();

  save(testCase: TestCase): void {
    this.cases.set(`${testCase.pluginId}:${testCase.name}`, JSON.parse(JSON.stringify(testCase)) as TestCase);
  }

  list(pluginId?: string): TestCase[] {
    return [...this.cases.values()].filter((item) => !pluginId || item.pluginId === pluginId);
  }

  remove(pluginId: string, name: string): boolean {
    return this.cases.delete(`${pluginId}:${name}`);
  }
}
