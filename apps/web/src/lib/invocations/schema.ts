export type AbiType =
  | { kind: 'string' | 'bool' | 'u32' | 'i32' | 'u64' | 'i64' | 'address' | 'bytes' }
  | { kind: 'vec'; element: AbiType }
  | { kind: 'map'; key: AbiType; value: AbiType }
  | { kind: 'struct'; fields: Array<{ name: string; type: AbiType }> }
  | { kind: 'enum'; variants: string[] };

export interface AbiArgument {
  name: string;
  type: AbiType;
  required?: boolean;
  description?: string;
}

export interface ContractFunction {
  name: string;
  args: AbiArgument[];
  mutability?: 'read' | 'write';
  description?: string;
}

export interface ContractSpec {
  contractId: string;
  name: string;
  network: string;
  functions: ContractFunction[];
}

export interface InvocationStep {
  id: string;
  contractId: string;
  functionName: string;
  args: Record<string, unknown>;
  dependsOn?: string;
  condition?: string;
}

export interface InvocationScenario {
  version: 1;
  name: string;
  network: string;
  invoker: string;
  budget: number;
  steps: InvocationStep[];
}

export const SAMPLE_CONTRACT: ContractSpec = {
  contractId: 'CCALLBUILDERDEMO000000000000000000000000000000000000000000000000',
  name: 'Counter example',
  network: 'testnet',
  functions: [
    { name: 'get', args: [], mutability: 'read', description: 'Read the current counter value.' },
    { name: 'increment', args: [{ name: 'by', type: { kind: 'u32' }, description: 'Amount to add.' }], mutability: 'write' },
    { name: 'set_label', args: [{ name: 'label', type: { kind: 'string' } }], mutability: 'write' },
    { name: 'set_owner', args: [{ name: 'owner', type: { kind: 'address' } }], mutability: 'write' },
  ],
};

const MAX_DEPTH = 8;
export function validateValue(type: AbiType, value: unknown, path = 'value', depth = 0): string[] {
  if (depth > MAX_DEPTH) return [`${path}: value is nested too deeply.`];
  if (value === undefined || value === null || value === '') return [`${path}: value is required.`];
  switch (type.kind) {
    case 'string': return typeof value === 'string' ? [] : [`${path}: enter text.`];
    case 'address': return typeof value === 'string' && /^G[A-Z2-7]{55}$/.test(value) ? [] : [`${path}: enter a valid Stellar public address.`];
    case 'bool': return typeof value === 'boolean' ? [] : [`${path}: choose true or false.`];
    case 'bytes': return typeof value === 'string' && /^(?:[0-9a-fA-F]{2})*$/.test(value) ? [] : [`${path}: enter an even-length hexadecimal byte string.`];
    case 'u32':
    case 'u64': {
      const n = typeof value === 'number' ? value : Number(value);
      const max = type.kind === 'u32' ? 0xffff_ffff : Number.MAX_SAFE_INTEGER;
      return Number.isSafeInteger(n) && n >= 0 && n <= max ? [] : [`${path}: enter a valid ${type.kind} integer.`];
    }
    case 'i32':
    case 'i64': {
      const n = typeof value === 'number' ? value : Number(value);
      const max = type.kind === 'i32' ? 0x7fff_ffff : Number.MAX_SAFE_INTEGER;
      const min = type.kind === 'i32' ? -0x8000_0000 : Number.MIN_SAFE_INTEGER;
      return Number.isSafeInteger(n) && n >= min && n <= max ? [] : [`${path}: enter a valid ${type.kind} integer.`];
    }
    case 'enum': return typeof value === 'string' && type.variants.includes(value) ? [] : [`${path}: choose one of ${type.variants.join(', ')}.`];
    case 'vec': {
      if (!Array.isArray(value)) return [`${path}: enter a JSON array.`];
      return value.flatMap((item, index) => validateValue(type.element, item, `${path}[${index}]`, depth + 1));
    }
    case 'map': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return [`${path}: enter a JSON object.`];
      return Object.entries(value).flatMap(([key, item]) => [
        ...validateValue(type.key, key, `${path} key`, depth + 1),
        ...validateValue(type.value, item, `${path}.${key}`, depth + 1),
      ]);
    }
    case 'struct': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return [`${path}: enter a JSON object.`];
      return type.fields.flatMap((field) => validateValue(field.type, (value as Record<string, unknown>)[field.name], `${path}.${field.name}`, depth + 1));
    }
  }
}

export function validateScenario(scenario: InvocationScenario, specs: ContractSpec[]): string[] {
  const errors: string[] = [];
  if (!scenario.name.trim()) errors.push('Scenario name is required.');
  if (!scenario.steps.length) errors.push('Add at least one call.');
  if (!Number.isSafeInteger(scenario.budget) || scenario.budget < 1 || scenario.budget > 100_000_000) errors.push('Budget must be between 1 and 100,000,000 instructions.');
  const ids = new Set<string>();
  scenario.steps.forEach((step, index) => {
    const prefix = `Step ${index + 1}`;
    if (ids.has(step.id)) errors.push(`${prefix}: duplicate step id.`);
    const spec = specs.find((item) => item.contractId === step.contractId);
    const fn = spec?.functions.find((item) => item.name === step.functionName);
    if (!spec || !fn) { errors.push(`${prefix}: select a known contract function.`); return; }
    if (step.dependsOn && !ids.has(step.dependsOn)) errors.push(`${prefix}: dependency must refer to an earlier step.`);
    fn.args.forEach((arg) => errors.push(...validateValue(arg.type, step.args[arg.name], `${prefix} · ${arg.name}`)));
    ids.add(step.id);
  });
  return errors;
}

export function isContractSpec(value: unknown): value is ContractSpec {
  if (!value || typeof value !== 'object') return false;
  const spec = value as ContractSpec;
  return typeof spec.contractId === 'string' && typeof spec.name === 'string' && typeof spec.network === 'string'
    && Array.isArray(spec.functions) && spec.functions.every((fn) => typeof fn.name === 'string' && Array.isArray(fn.args));
}
