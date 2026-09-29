import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { flattenCatalogKeys, generateKeysFileContent } from '../../scripts/lib/i18n-codegen.mjs';
import { MESSAGE_KEYS } from './generated/keys';

const EN_CATALOG_DIR = path.join(__dirname, 'catalogs', 'en');

describe('flattenCatalogKeys', () => {
  it('flattens a nested catalog into dotted, namespaced keys', () => {
    const keys = flattenCatalogKeys({ a: { b: 'x', c: { d: 'y' } } }, 'ns');
    expect(keys).toEqual(['ns.a.b', 'ns.a.c.d']);
  });
});

describe('generateKeysFileContent', () => {
  it('renders a MESSAGE_KEYS/MessageKey module', () => {
    const content = generateKeysFileContent(['ns.a', 'ns.b']);
    expect(content).toContain("'ns.a',");
    expect(content).toContain('export type MessageKey = (typeof MESSAGE_KEYS)[number];');
  });
});

describe('generated keys stay in sync with the en catalogs', () => {
  // Mirrors scripts/generate-i18n-types.mjs: every namespace catalog in the
  // en dir is the source of truth, not a hardcoded subset — otherwise a new
  // namespace silently drops out of the committed key union.
  const enCatalogKeys = () =>
    readdirSync(EN_CATALOG_DIR)
      .filter((file) => file.endsWith('.json'))
      .sort()
      .flatMap((file) => {
        const namespace = path.basename(file, '.json');
        const catalog = JSON.parse(
          readFileSync(path.join(EN_CATALOG_DIR, file), 'utf8'),
        );
        return flattenCatalogKeys(catalog, namespace);
      })
      .sort();

  it('matches the committed src/i18n/generated/keys.ts (run `pnpm run i18n:generate` if this fails)', () => {
    expect([...MESSAGE_KEYS].sort()).toEqual(enCatalogKeys());
  });

  it('the committed generated file matches what the generator would produce byte-for-byte', () => {
    const expectedContent = generateKeysFileContent(enCatalogKeys());
    const actualContent = readFileSync(path.join(__dirname, 'generated/keys.ts'), 'utf8');
    expect(actualContent).toBe(expectedContent);
  });
});
