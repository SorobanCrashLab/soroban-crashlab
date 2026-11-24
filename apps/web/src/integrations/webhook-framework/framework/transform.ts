/** Transform pipeline: deterministic, sandbox-free payload transformations (#2204). */

import type { TransformStep, WebhookEvent } from './types';

/** Read a dotted path from an event (e.g. `payload.crash.type`). */
export function readPath(event: WebhookEvent, path: string): unknown {
  let current: unknown = event;
  for (const part of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Interpolate `{{path}}` placeholders with values read from the event. */
export function interpolate(template: string, event: WebhookEvent): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, rawPath: string) => {
    const value = readPath(event, rawPath.trim());
    if (value === undefined || value === null) return '';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });
}

/** Execute an ordered list of transform steps against an event. */
export function runTransformPipeline(
  event: WebhookEvent,
  steps: TransformStep[] = [],
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const step of steps) {
    switch (step.kind) {
      case 'pick':
        output[step.as] = readPath(event, step.path);
        break;
      case 'template':
        output[step.as] = interpolate(step.template, event);
        break;
      case 'constant':
        output[step.as] = step.value;
        break;
    }
  }
  return output;
}
