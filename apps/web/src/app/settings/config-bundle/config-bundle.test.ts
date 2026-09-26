import { describe, expect, it } from 'vitest';
import {
  BUNDLE_SECTIONS,
  canonicalizeValue,
  createEmptyBundle,
  CURRENT_BUNDLE_VERSION,
  serializeBundle,
  validateBundle,
  type ConfigBundle,
} from './bundle-schema';
import { BUNDLE_MIGRATORS, migrateBundle, migrateV0ToV1 } from './bundle-migrations';
import { diffBundle, diffSection } from './bundle-diff';
import { commitImport, exportBundle, prepareImport } from './bundle-pipeline';
import type { ConfigBundleGateway } from './bundle-gateway';

const rule = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `Rule ${id}`,
  description: 'desc',
  category: 'reliability',
  enabled: true,
  severity: 'high',
  condition: 'threshold',
  threshold: 5,
  unit: 'failures',
  channels: ['slack'],
  cooldown: 10,
  tags: ['preset'],
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const channel = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  type: 'slack',
  name: `Channel ${id}`,
  enabled: true,
  config: { webhook: 'https://hooks.example.com/x' },
  ...overrides,
});

const preset = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `Preset ${id}`,
  description: 'desc',
  filters: { severity: 'critical' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

function validBundle(): ConfigBundle {
  const result = validateBundle({
    version: CURRENT_BUNDLE_VERSION,
    sections: {
      alertRules: [rule('r1'), rule('r2')],
      channels: [channel('c1')],
      filterPresets: [preset('p1')],
    },
  });
  if (!result.ok) throw new Error('fixture should validate');
  return result.bundle;
}

/** Gateway backed by a plain object, with an optional write failure injected. */
function fakeGateway(initial: ConfigBundle, failOnWrite = false) {
  let stored = initial;
  const gateway: ConfigBundleGateway = {
    read: () => stored,
    write: (next) => {
      if (failOnWrite) throw new Error('storage rejected the write');
      stored = next;
    },
  };
  return { gateway, current: () => stored };
}

describe('schema validation', () => {
  it('accepts a well-formed bundle', () => {
    const result = validateBundle({
      version: 1,
      sections: { alertRules: [rule('r1')], channels: [channel('c1')], filterPresets: [preset('p1')] },
    });
    expect(result.ok).toBe(true);
  });

  it('reports the offending section and path', () => {
    const result = validateBundle({
      version: 1,
      sections: {
        alertRules: [rule('r1', { threshold: 'not a number' })],
        channels: [],
        filterPresets: [],
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].section).toBe('alertRules');
    expect(result.issues[0].path).toBe('sections.alertRules.0.threshold');
  });

  it('rejects a bundle whose version is not the current one', () => {
    const result = validateBundle({ version: 0, sections: createEmptyBundle().sections });
    expect(result.ok).toBe(false);
  });

  it('covers all three domains', () => {
    expect(BUNDLE_SECTIONS).toEqual(['alertRules', 'channels', 'filterPresets']);
  });
});

describe('canonical serialization', () => {
  it('emits object keys in sorted order', () => {
    expect(JSON.stringify(canonicalizeValue({ b: 1, a: { d: 2, c: 3 } }))).toBe(
      '{"a":{"c":3,"d":2},"b":1}',
    );
  });

  it('orders section items by id regardless of input order', () => {
    const forward = validateBundle({
      version: 1,
      sections: { alertRules: [rule('r1'), rule('r2')], channels: [], filterPresets: [] },
    });
    const reversed = validateBundle({
      version: 1,
      sections: { alertRules: [rule('r2'), rule('r1')], channels: [], filterPresets: [] },
    });
    if (!forward.ok || !reversed.ok) throw new Error('fixtures should validate');
    expect(serializeBundle(forward.bundle)).toBe(serializeBundle(reversed.bundle));
  });

  it('round-trips export → import → export byte-for-byte', () => {
    const source = validBundle();
    const firstExport = serializeBundle(source);

    const prepared = prepareImport(firstExport, createEmptyBundle());
    expect(prepared.status).toBe('ready');
    if (prepared.status !== 'ready') return;

    expect(serializeBundle(prepared.bundle)).toBe(firstExport);
  });

  it('round-trips through a gateway export as well', () => {
    const { gateway } = fakeGateway(validBundle());
    const first = exportBundle(gateway);
    const prepared = prepareImport(first, createEmptyBundle());
    if (prepared.status !== 'ready') throw new Error('expected a ready preparation');
    const { gateway: second } = fakeGateway(prepared.bundle);
    expect(exportBundle(second)).toBe(first);
  });
});

describe('migration framework', () => {
  /** Legacy v0 export: the three domains sat flat at the top level. */
  const V0_FIXTURE = {
    version: 0,
    alertRules: [rule('r1')],
    channels: [channel('c1')],
    filterPresets: [preset('p1')],
  };

  it('registers a migrator for every version below the current one', () => {
    for (let version = 0; version < CURRENT_BUNDLE_VERSION; version += 1) {
      expect(BUNDLE_MIGRATORS[version]).toBeTypeOf('function');
    }
  });

  it('migrates the v0 fixture into a valid v1 bundle', () => {
    const migrated = migrateBundle(V0_FIXTURE);
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;

    expect(migrated.applied).toEqual([0]);
    const validation = validateBundle(migrated.value);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.bundle.sections.alertRules).toHaveLength(1);
    expect(validation.bundle.sections.channels).toHaveLength(1);
    expect(validation.bundle.sections.filterPresets).toHaveLength(1);
  });

  it('fills in sections a v0 document omitted', () => {
    expect(migrateV0ToV1({ version: 0 })).toEqual({
      version: 1,
      sections: { alertRules: [], channels: [], filterPresets: [] },
    });
  });

  it('leaves a current-version bundle untouched', () => {
    const migrated = migrateBundle(validBundle());
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.applied).toEqual([]);
  });

  it('refuses a bundle from a newer build', () => {
    const migrated = migrateBundle({ version: CURRENT_BUNDLE_VERSION + 1, sections: {} });
    expect(migrated.ok).toBe(false);
    if (migrated.ok) return;
    expect(migrated.error).toContain('newer than this build supports');
  });

  it('refuses a document with no version field', () => {
    const migrated = migrateBundle({ sections: {} });
    expect(migrated.ok).toBe(false);
  });

  it('imports a v0 file end to end through the pipeline', () => {
    const prepared = prepareImport(JSON.stringify(V0_FIXTURE), createEmptyBundle());
    expect(prepared.status).toBe('ready');
    if (prepared.status !== 'ready') return;
    expect(prepared.migrationsApplied).toEqual([0]);
    expect(prepared.diff.totalAdded).toBe(3);
  });
});

describe('diff preview', () => {
  it('classifies added, changed, unchanged and removed items', () => {
    const diff = diffSection(
      'alertRules',
      [rule('r1'), rule('r2'), rule('r3')],
      [rule('r1'), rule('r2', { threshold: 99 }), rule('r4')],
    );

    expect(diff.unchanged.map((item) => item.id)).toEqual(['r1']);
    expect(diff.changed.map((item) => item.id)).toEqual(['r2']);
    expect(diff.added.map((item) => item.id)).toEqual(['r4']);
    expect(diff.removed.map((item) => item.id)).toEqual(['r3']);
  });

  it('ignores key ordering when deciding whether an item changed', () => {
    const diff = diffSection(
      'channels',
      [{ id: 'c1', name: 'x' }],
      [{ name: 'x', id: 'c1' }],
    );
    expect(diff.changed).toEqual([]);
    expect(diff.unchanged.map((item) => item.id)).toEqual(['c1']);
  });

  it('totals counts across every section', () => {
    const diff = diffBundle(createEmptyBundle(), validBundle());
    expect(diff.sections.map((section) => section.section)).toEqual([...BUNDLE_SECTIONS]);
    expect(diff.totalAdded).toBe(4);
    expect(diff.totalChanged).toBe(0);
    expect(diff.totalRemoved).toBe(0);
  });
});

describe('atomic commit', () => {
  it('applies a valid bundle', () => {
    const { gateway, current } = fakeGateway(createEmptyBundle());
    expect(commitImport(gateway, validBundle())).toEqual({ ok: true });
    expect(current().sections.alertRules).toHaveLength(2);
  });

  it('rejects a hostile mid-section corruption wholesale, leaving storage untouched', () => {
    const before = validBundle();
    const { gateway, current } = fakeGateway(before);

    const corrupted = {
      version: 1,
      sections: {
        alertRules: [rule('r1'), rule('r2', { severity: 'catastrophic' })],
        channels: [channel('c1')],
        filterPresets: [preset('p1')],
      },
    };

    const prepared = prepareImport(JSON.stringify(corrupted), before);
    expect(prepared.status).toBe('invalid');
    if (prepared.status !== 'invalid') return;
    expect(prepared.errors.join(' ')).toContain('sections.alertRules.1.severity');

    // Forcing the same document past the preview is refused too, so the good
    // first rule is never written on its own.
    const forced = commitImport(gateway, corrupted as unknown as ConfigBundle);
    expect(forced.ok).toBe(false);
    expect(current()).toBe(before);
  });

  it('leaves storage untouched when the gateway write throws', () => {
    const before = createEmptyBundle();
    const { gateway, current } = fakeGateway(before, true);

    const result = commitImport(gateway, validBundle());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('storage rejected the write');
    expect(current()).toBe(before);
  });

  it('refuses to commit a bundle that no longer validates', () => {
    const { gateway, current } = fakeGateway(createEmptyBundle());
    const bogus = { version: 1, sections: { alertRules: [rule('r1', { cooldown: 'soon' })] } };
    const result = commitImport(gateway, bogus as unknown as ConfigBundle);
    expect(result.ok).toBe(false);
    expect(current().sections.alertRules).toEqual([]);
  });
});

describe('invalid input handling', () => {
  it('reports non-JSON input', () => {
    const prepared = prepareImport('{not json', createEmptyBundle());
    expect(prepared).toEqual({ status: 'invalid', errors: ['File is not valid JSON.'] });
  });

  it('reports every problem at once rather than the first', () => {
    const prepared = prepareImport(
      JSON.stringify({
        version: 1,
        sections: {
          alertRules: [rule('r1', { threshold: 'x' })],
          channels: [channel('c1', { enabled: 'yes' })],
          filterPresets: [],
        },
      }),
      createEmptyBundle(),
    );
    expect(prepared.status).toBe('invalid');
    if (prepared.status !== 'invalid') return;
    expect(prepared.errors.length).toBeGreaterThan(1);
  });
});
