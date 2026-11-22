/**
 * lib/openapi/zod-to-json-schema — minimal zod → JSON Schema converter (#1670).
 * Dependency-free: inspects zod internals (_def) for the subset used in
 * lib/schemas (objects, enums, arrays, optionals, nullables, defaults).
 * Falls back to {} for unknown shapes rather than throwing.
 */

type JsonSchema = Record<string, unknown>;

function baseOf(schema: unknown): { typeName: string; def: Record<string, unknown> } | null {
  const s = schema as { _def?: { typeName?: string } } | null;
  if (!s || !s._def || typeof s._def.typeName !== 'string') return null;
  return { typeName: s._def.typeName, def: s._def as Record<string, unknown> };
}

export function zodToJsonSchema(schema: unknown): JsonSchema {
  const base = baseOf(schema);
  if (!base) return {};
  const { typeName, def } = base;

  switch (typeName) {
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodEnum':
      return { type: 'string', enum: (def.values as string[]) ?? [] };
    case 'ZodLiteral':
      return { const: def.value };
    case 'ZodArray':
      return { type: 'array', items: zodToJsonSchema(def.type) };
    case 'ZodObject': {
      const shape =
        typeof (def.shape as unknown) === 'function'
          ? (def.shape as () => Record<string, unknown>)()
          : (def.shape as Record<string, unknown>);
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const [key, sub] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(sub);
        const inner = baseOf(sub)?.typeName;
        if (inner !== 'ZodOptional' && inner !== 'ZodDefault') required.push(key);
      }
      const out: JsonSchema = { type: 'object', properties };
      if (required.length > 0) out.required = required;
      return out;
    }
    case 'ZodOptional':
    case 'ZodDefault':
      return zodToJsonSchema(def.innerType);
    case 'ZodNullable':
      return { anyOf: [zodToJsonSchema(def.innerType), { type: 'null' }] };
    case 'ZodRecord':
      return { type: 'object', additionalProperties: zodToJsonSchema(def.valueType) };
    case 'ZodUnion':
      return { anyOf: ((def.options as unknown[]) ?? []).map(zodToJsonSchema) };
    default:
      return {};
  }
}
