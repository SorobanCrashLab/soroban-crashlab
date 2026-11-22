/**
 * lib/openapi/spec-diff.test — contract change classification (#1831).
 * Covers the breaking rules from the issue (removed route/field, narrowed
 * type, changed status) and the additive paths that must pass the gate.
 */
import { describe, expect, it } from 'vitest';
import { diffOpenApiSpecs, renderSpecDiffMarkdown, type SpecDiff } from './spec-diff';

function specOf(paths: Record<string, unknown>, schemas: Record<string, unknown> = {}) {
  return {
    openapi: '3.1.0',
    info: { title: 't', version: '1' },
    paths,
    components: { schemas },
  };
}

function op(responses: Record<string, unknown>) {
  return { summary: 'x', responses };
}

function ok(schema: unknown) {
  return { 200: { description: 'ok', content: { 'application/json': { schema } } } };
}

function messages(diff: SpecDiff, kind: 'breaking' | 'additive'): string[] {
  return (kind === 'breaking' ? diff.breaking : diff.additive).map((f) => f.message);
}

describe('diffOpenApiSpecs', () => {
  it('flags a removed route as breaking', () => {
    const base = specOf({ '/api/runs': { get: op(ok({ type: 'object' })) } });
    const next = specOf({});
    const diff = diffOpenApiSpecs(base, next);
    expect(diff.hasBreaking).toBe(true);
    expect(messages(diff, 'breaking')).toContain('GET /api/runs: route removed');
  });

  it('treats a new route as additive', () => {
    const base = specOf({});
    const next = specOf({ '/api/runs': { get: op(ok({ type: 'object' })) } });
    const diff = diffOpenApiSpecs(base, next);
    expect(diff.hasBreaking).toBe(false);
    expect(messages(diff, 'additive')).toContain('GET /api/runs: route added');
  });

  it('flags a removed response status (changed status) as breaking', () => {
    const base = specOf({
      '/api/runs': { post: op({ 200: { description: 'ok' }, 201: { description: 'created' } }) },
    });
    const next = specOf({
      '/api/runs': { post: op({ 200: { description: 'ok' } }) },
    });
    const diff = diffOpenApiSpecs(base, next);
    expect(messages(diff, 'breaking')).toContain('POST /api/runs: response 201 removed');
  });

  it('flags a removed field and a narrowed type as breaking', () => {
    const base = specOf(
      { '/api/runs': { get: op(ok({ $ref: '#/components/schemas/Run' })) } },
      {
        Run: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' }, count: { type: 'number' }, tags: { type: 'array' } },
        },
      },
    );
    const next = specOf(
      { '/api/runs': { get: op(ok({ $ref: '#/components/schemas/Run' })) } },
      {
        Run: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' }, count: { type: 'string' } },
        },
      },
    );
    const diff = diffOpenApiSpecs(base, next);
    const breaking = messages(diff, 'breaking');
    expect(breaking).toContain('components.schemas.Run.tags: field removed');
    expect(breaking).toContain('components.schemas.Run.count: type narrowed from number to string');
  });

  it('treats a new field as additive and an existing field becoming required as breaking', () => {
    const base = specOf(
      { '/api/runs': { get: op(ok({ $ref: '#/components/schemas/Run' })) } },
      { Run: { type: 'object', properties: { id: { type: 'string' } } } },
    );
    const next = specOf(
      { '/api/runs': { get: op(ok({ $ref: '#/components/schemas/Run' })) } },
      { Run: { type: 'object', properties: { id: { type: 'string' }, note: { type: 'string' } }, required: ['id'] } },
    );
    const diff = diffOpenApiSpecs(base, next);
    expect(diff.hasBreaking).toBe(true);
    expect(messages(diff, 'additive')).toContain('components.schemas.Run.note: field added');
    expect(messages(diff, 'breaking')).toContain('components.schemas.Run.id: field became required');
  });

  it('narrows enums as breaking and widens them as additive', () => {
    const base = specOf(
      {},
      { Status: { type: 'string', enum: ['running', 'completed', 'failed'] } },
    );
    const narrowed = specOf({}, { Status: { type: 'string', enum: ['running', 'completed'] } });
    const widened = specOf({}, { Status: { type: 'string', enum: ['running', 'completed', 'failed', 'cancelled'] } });

    expect(messages(diffOpenApiSpecs(base, narrowed), 'breaking')).toContain(
      'components.schemas.Status: enum value(s) removed: "failed"',
    );
    const widenedDiff = diffOpenApiSpecs(base, widened);
    expect(widenedDiff.hasBreaking).toBe(false);
    expect(messages(widenedDiff, 'additive')).toContain('components.schemas.Status: enum value(s) added: "cancelled"');
  });

  it('classifies nullability changes as union variant changes', () => {
    const inner = { type: 'object', properties: { id: { type: 'string' } } };
    const nullable = specOf(
      {},
      { Run: { type: 'object', properties: { crashDetail: { anyOf: [inner, { type: 'null' }] } } } },
    );
    const nonNullable = specOf(
      {},
      { Run: { type: 'object', properties: { crashDetail: inner } } },
    );

    expect(messages(diffOpenApiSpecs(nullable, nonNullable), 'breaking')).toContain(
      'components.schemas.Run.crashDetail: union variant(s) removed',
    );
    const widened = diffOpenApiSpecs(nonNullable, nullable);
    expect(widened.hasBreaking).toBe(false);
    expect(messages(widened, 'additive')).toContain('components.schemas.Run.crashDetail: union variant(s) added');
  });

  it('ignores prose-only changes', () => {
    const base = specOf({ '/api/runs': { get: { summary: 'old', responses: {} } } });
    const next = specOf({ '/api/runs': { get: { summary: 'new', responses: {} } } });
    const diff = diffOpenApiSpecs(base, next);
    expect(diff.breaking).toHaveLength(0);
    expect(diff.additive).toHaveLength(0);
  });

  it('treats an unchanged spec as clean', () => {
    const spec = specOf({ '/api/runs': { get: op(ok({ $ref: '#/components/schemas/Run' })) } }, {
      Run: { type: 'object', properties: { id: { type: 'string' } } },
    });
    const diff = diffOpenApiSpecs(spec, spec);
    expect(diff.hasBreaking).toBe(false);
    expect(diff.breaking).toHaveLength(0);
    expect(diff.additive).toHaveLength(0);
  });
});

describe('renderSpecDiffMarkdown', () => {
  it('renders breaking findings with the approval marker hint', () => {
    const diff = diffOpenApiSpecs(
      specOf({ '/api/runs': { get: op(ok({ type: 'object' })) } }),
      specOf({}),
    );
    const markdown = renderSpecDiffMarkdown(diff);
    expect(markdown).toContain('### :warning: Breaking (1)');
    expect(markdown).toContain('GET /api/runs: route removed');
    expect(markdown).toContain('openapi-breaking-approved');
  });

  it('renders additive-only changes as passing', () => {
    const diff = diffOpenApiSpecs(specOf({}), specOf({ '/api/runs': { get: op(ok({ type: 'object' })) } }));
    const markdown = renderSpecDiffMarkdown(diff);
    expect(markdown).toContain('### Additive (1)');
    expect(markdown).not.toContain('openapi-breaking-approved');
    expect(markdown).toContain('no maintainer approval needed');
  });
});
