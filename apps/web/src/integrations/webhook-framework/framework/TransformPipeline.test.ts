/** Transform pipeline tests (#2204). */
import { describe, expect, it } from 'vitest';
import { interpolate, readPath, runTransformPipeline } from './transform';
import type { WebhookEvent } from './types';

const event: WebhookEvent = {
  type: 'crash.created',
  payload: { campaign: 'mainnet-fuzz', crash: { type: 'Reentrancy' }, run_id: 'run_1' },
};

describe('transform pipeline', () => {
  it('reads dotted paths', () => {
    expect(readPath(event, 'payload.crash.type')).toBe('Reentrancy');
    expect(readPath(event, 'payload.missing.deep')).toBeUndefined();
  });

  it('interpolates templates and omits missing values', () => {
    expect(interpolate('{{payload.crash.type}} - {{payload.run_id}}', event)).toBe('Reentrancy - run_1');
    expect(interpolate('x{{payload.missing}}y', event)).toBe('xy');
  });

  it('runs ordered transform steps', () => {
    const result = runTransformPipeline(event, [
      { kind: 'pick', path: 'payload.campaign', as: 'tags' },
      { kind: 'template', template: '{{payload.crash.type}}', as: 'title' },
      { kind: 'constant', value: 'crashlab', as: 'source' },
    ]);
    expect(result).toEqual({ tags: 'mainnet-fuzz', title: 'Reentrancy', source: 'crashlab' });
  });

  it('is a no-op without steps', () => {
    expect(runTransformPipeline(event)).toEqual({});
  });
});
