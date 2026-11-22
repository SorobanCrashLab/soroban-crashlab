import { describe, expect, it } from 'vitest';
import { SAMPLE_CONTRACT, validateScenario, validateValue } from './schema';
import { serializeScenario } from './serialize';
import { InvocationScenario } from './schema';

const base: InvocationScenario = { version: 1, name: 'demo', network: 'testnet', invoker: '', budget: 10_000_000, steps: [{ id: 'one', contractId: SAMPLE_CONTRACT.contractId, functionName: 'increment', args: { by: 3 } }] };

describe('invocation composer schema', () => {
  it('validates typed scalar, struct, enum, vector, and address values', () => {
    expect(validateValue({ kind: 'u32' }, 4)).toEqual([]);
    expect(validateValue({ kind: 'u32' }, -1).length).toBeGreaterThan(0);
    expect(validateValue({ kind: 'struct', fields: [{ name: 'n', type: { kind: 'string' } }] }, { n: 'ok' })).toEqual([]);
    expect(validateValue({ kind: 'enum', variants: ['a', 'b'] }, 'a')).toEqual([]);
    expect(validateValue({ kind: 'vec', element: { kind: 'bool' } }, [true, false])).toEqual([]);
    expect(validateValue({ kind: 'address' }, 'not-an-address').length).toBeGreaterThan(0);
  });
  it('rejects unknown functions and forward dependencies', () => {
    expect(validateScenario({ ...base, steps: [{ ...base.steps[0], functionName: 'missing' }] }, [SAMPLE_CONTRACT]).length).toBeGreaterThan(0);
    expect(validateScenario({ ...base, steps: [{ ...base.steps[0], dependsOn: 'later' }] }, [SAMPLE_CONTRACT]).length).toBeGreaterThan(0);
  });
  it('serializes object keys deterministically', () => {
    expect(serializeScenario({ ...base, steps: [{ ...base.steps[0], args: { z: 1, a: 2 } }] })).toBe(serializeScenario({ ...base, steps: [{ ...base.steps[0], args: { a: 2, z: 1 } }] }));
  });
});
