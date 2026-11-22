/**
 * lib/openapi/spec-diff — classify OpenAPI contract changes (#1831).
 *
 * Compares a base spec (what consumers built against) with the next spec
 * (freshly generated from the route catalog) and splits every change into:
 *
 *   breaking — removed route/field/response status, narrowed type, removed
 *              enum value, or an optional field that became required. These
 *              fail the CI gate until a maintainer approves on the PR.
 *   additive — new route/field/response status, widened enum, or a field that
 *              became optional. These pass the gate.
 *
 * Description/summary/tag text is ignored: prose churn is not a contract
 * change. Everything is deterministic (findings sorted by message) so the
 * gate output is stable across reruns.
 */

export interface SpecDiffFinding {
  kind: 'breaking' | 'additive';
  message: string;
}

export interface SpecDiff {
  breaking: SpecDiffFinding[];
  additive: SpecDiffFinding[];
  hasBreaking: boolean;
}

type Json = Record<string, unknown>;

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

function asJson(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

function isObject(value: unknown): value is Json {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function typeOf(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function resolveRef(ref: string | undefined, spec: Json): unknown {
  if (!ref || !ref.startsWith('#/')) return undefined;
  let node: unknown = spec;
  for (const rawSegment of ref.slice(2).split('/')) {
    const segment = rawSegment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!isObject(node)) return undefined;
    node = node[segment];
  }
  return node;
}

/** Follow $ref once so two references to the same schema compare by content. */
function deref(value: unknown, spec: Json): unknown {
  if (isObject(value) && typeof value.$ref === 'string') {
    const target = resolveRef(value.$ref, spec);
    return target === undefined ? value : target;
  }
  return value;
}

class FindingCollector {
  private readonly seen = new Set<string>();
  readonly findings: SpecDiffFinding[] = [];

  add(kind: 'breaking' | 'additive', message: string): void {
    const key = `${kind}:${message}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.findings.push({ kind, message });
  }
}

function stableKey(value: unknown): string {
  return JSON.stringify(value);
}

function compareSchema(
  base: unknown,
  next: unknown,
  baseSpec: Json,
  nextSpec: Json,
  label: string,
  out: FindingCollector,
): void {
  const baseResolved = deref(base, baseSpec);
  const nextResolved = deref(next, nextSpec);

  if (baseResolved === undefined && nextResolved === undefined) return;
  if (baseResolved === undefined) {
    out.add('additive', `${label}: schema added`);
    return;
  }
  if (nextResolved === undefined) {
    out.add('breaking', `${label}: schema removed`);
    return;
  }

  // Identical references are compared once via the components.schemas pass;
  // re-walking them per operation would multiply the same finding by the
  // number of routes that use the shared schema.
  const baseRef = isObject(base) && typeof base.$ref === 'string' ? base.$ref : undefined;
  const nextRef = isObject(next) && typeof next.$ref === 'string' ? next.$ref : undefined;
  if (baseRef !== undefined && baseRef === nextRef) return;

  const baseObj = asJson(baseResolved);
  const nextObj = asJson(nextResolved);

  const baseType = baseObj.type;
  const nextType = nextObj.type;
  if (typeof baseType === 'string' && typeof nextType === 'string' && baseType !== nextType) {
    out.add('breaking', `${label}: type narrowed from ${baseType} to ${nextType}`);
    return;
  }

  if (Array.isArray(baseObj.enum) && Array.isArray(nextObj.enum)) {
    const baseValues = baseObj.enum.map(stableKey);
    const nextValues = new Set(nextObj.enum.map(stableKey));
    const removed = baseObj.enum.filter((v: unknown) => !nextValues.has(stableKey(v)));
    const baseValueKeys = new Set(baseValues);
    const added = nextObj.enum.filter((v: unknown) => !baseValueKeys.has(stableKey(v)));
    if (removed.length > 0) {
      out.add('breaking', `${label}: enum value(s) removed: ${removed.map((v: unknown) => JSON.stringify(v)).join(', ')}`);
    }
    if (added.length > 0) {
      out.add('additive', `${label}: enum value(s) added: ${added.map((v: unknown) => JSON.stringify(v)).join(', ')}`);
    }
  }

  const baseVariants = Array.isArray(baseObj.anyOf) ? (baseObj.anyOf as unknown[]) : null;
  const nextVariants = Array.isArray(nextObj.anyOf) ? (nextObj.anyOf as unknown[]) : null;
  if (baseVariants || nextVariants) {
    // A union on only one side is still a union: compare the declared
    // variants against the other side's single schema so gaining/losing a
    // variant (e.g. nullability) is classified rather than misread as a
    // batch of field adds/removes.
    const baseList = baseVariants ?? [baseResolved];
    const nextList = nextVariants ?? [nextResolved];
    const baseKeys = baseList.map(stableKey);
    const nextKeys = nextList.map(stableKey);
    const nextKeySet = new Set(nextKeys);
    const baseKeySet = new Set(baseKeys);
    if (baseKeys.some((key) => !nextKeySet.has(key))) {
      out.add('breaking', `${label}: union variant(s) removed`);
    }
    if (nextKeys.some((key) => !baseKeySet.has(key))) {
      out.add('additive', `${label}: union variant(s) added`);
    }
    for (const variant of baseList) {
      const key = stableKey(variant);
      const match = nextList.find((candidate) => stableKey(candidate) === key);
      if (match !== undefined) {
        compareSchema(variant, match, baseSpec, nextSpec, label, out);
      }
    }
    return;
  }

  if (Array.isArray(baseObj.items) || isObject(baseObj.items)) {
    compareSchema(baseObj.items, nextObj.items, baseSpec, nextSpec, `${label}[]`, out);
  }

  if (baseType === 'object' || nextType === 'object' || baseObj.properties || nextObj.properties) {
    const baseProps = asJson(baseObj.properties);
    const nextProps = asJson(nextObj.properties);
    for (const key of Object.keys(baseProps)) {
      if (!(key in nextProps)) {
        out.add('breaking', `${label}.${key}: field removed`);
      } else {
        compareSchema(baseProps[key], nextProps[key], baseSpec, nextSpec, `${label}.${key}`, out);
      }
    }
    for (const key of Object.keys(nextProps)) {
      if (!(key in baseProps)) {
        out.add('additive', `${label}.${key}: field added`);
      }
    }

    const baseRequired = new Set(Array.isArray(baseObj.required) ? (baseObj.required as string[]) : []);
    const nextRequired = new Set(Array.isArray(nextObj.required) ? (nextObj.required as string[]) : []);
    for (const key of baseRequired) {
      if (!nextRequired.has(key) && key in baseProps) {
        out.add('additive', `${label}.${key}: field became optional`);
      }
    }
    for (const key of nextRequired) {
      if (!baseRequired.has(key) && key in baseProps) {
        out.add('breaking', `${label}.${key}: field became required`);
      }
    }
  }
}

function compareOperation(
  baseOp: Json,
  nextOp: Json,
  baseSpec: Json,
  nextSpec: Json,
  route: string,
  out: FindingCollector,
): void {
  const baseResponses = asJson(baseOp.responses);
  const nextResponses = asJson(nextOp.responses);

  for (const status of Object.keys(baseResponses)) {
    if (!(status in nextResponses)) {
      out.add('breaking', `${route}: response ${status} removed`);
      continue;
    }
    const baseContent = asJson(asJson(baseResponses[status]).content);
    const nextContent = asJson(asJson(nextResponses[status]).content);
    const baseSchema = asJson(baseContent['application/json']).schema;
    const nextSchema = asJson(nextContent['application/json']).schema;
    compareSchema(baseSchema, nextSchema, baseSpec, nextSpec, `${route} response ${status}`, out);
  }
  for (const status of Object.keys(nextResponses)) {
    if (!(status in baseResponses)) {
      out.add('additive', `${route}: response ${status} added`);
    }
  }
}

/**
 * Diff two OpenAPI documents. `base` is the previously published contract;
 * `next` is the freshly generated spec.
 */
export function diffOpenApiSpecs(base: unknown, next: unknown): SpecDiff {
  const baseSpec = asJson(base);
  const nextSpec = asJson(next);
  const out = new FindingCollector();

  const basePaths = asJson(baseSpec.paths);
  const nextPaths = asJson(nextSpec.paths);

  for (const pathKey of Object.keys(basePaths)) {
    const baseOps = asJson(basePaths[pathKey]);
    const nextOps = asJson(nextPaths[pathKey]);
    for (const method of HTTP_METHODS) {
      if (!(method in baseOps)) continue;
      const route = `${method.toUpperCase()} ${pathKey}`;
      if (!(method in nextOps)) {
        out.add('breaking', `${route}: route removed`);
        continue;
      }
      compareOperation(asJson(baseOps[method]), asJson(nextOps[method]), baseSpec, nextSpec, route, out);
    }
  }
  for (const pathKey of Object.keys(nextPaths)) {
    if (pathKey in basePaths) continue;
    for (const method of HTTP_METHODS) {
      if (method in asJson(nextPaths[pathKey])) {
        out.add('additive', `${method.toUpperCase()} ${pathKey}: route added`);
      }
    }
  }

  const baseSchemas = asJson(asJson(baseSpec.components).schemas);
  const nextSchemas = asJson(asJson(nextSpec.components).schemas);
  for (const name of Object.keys(baseSchemas)) {
    if (!(name in nextSchemas)) {
      out.add('breaking', `components.schemas.${name}: schema removed`);
      continue;
    }
    compareSchema(baseSchemas[name], nextSchemas[name], baseSpec, nextSpec, `components.schemas.${name}`, out);
  }
  for (const name of Object.keys(nextSchemas)) {
    if (!(name in baseSchemas)) {
      out.add('additive', `components.schemas.${name}: schema added`);
    }
  }

  const breaking = out.findings.filter((f) => f.kind === 'breaking').sort((a, b) => a.message.localeCompare(b.message));
  const additive = out.findings.filter((f) => f.kind === 'additive').sort((a, b) => a.message.localeCompare(b.message));
  return { breaking, additive, hasBreaking: breaking.length > 0 };
}

/** Markdown report for the CI job summary / PR review. */
export function renderSpecDiffMarkdown(diff: SpecDiff): string {
  const lines = ['## OpenAPI contract changes', ''];
  if (diff.breaking.length === 0 && diff.additive.length === 0) {
    lines.push('No contract changes.');
    return `${lines.join('\n')}\n`;
  }
  if (diff.breaking.length > 0) {
    lines.push(`### :warning: Breaking (${diff.breaking.length})`, '');
    for (const finding of diff.breaking) lines.push(`- ${finding.message}`);
    lines.push('');
  }
  if (diff.additive.length > 0) {
    lines.push(`### Additive (${diff.additive.length})`, '');
    for (const finding of diff.additive) lines.push(`- ${finding.message}`);
    lines.push('');
  }
  if (diff.hasBreaking) {
    lines.push(
      'Breaking changes require a maintainer to comment `openapi-breaking-approved` on the PR ' +
        '(or apply that label) after confirming downstream consumers (SDK/CLI/Action) are updated.',
    );
  } else {
    lines.push('All changes are additive — no maintainer approval needed.');
  }
  return `${lines.join('\n')}\n`;
}
