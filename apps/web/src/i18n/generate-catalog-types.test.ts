import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { flattenCatalogKeys, generateKeysFileContent } from '../../scripts/lib/i18n-codegen.mjs';
import notificationsEn from './catalogs/en/notifications.json';
import landingEn from './catalogs/en/landing.json';
import { MESSAGE_KEYS } from './generated/keys';

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
  const enCatalogKeys = () =>
    [...flattenCatalogKeys(notificationsEn, 'notifications'), ...flattenCatalogKeys(landingEn, 'landing')].sort();

  it('matches the committed src/i18n/generated/keys.ts (run `pnpm run i18n:generate` if this fails)', () => {
    expect([...MESSAGE_KEYS].sort()).toEqual(enCatalogKeys());
  });

  it('the committed generated file matches what the generator would produce byte-for-byte', () => {
    const expectedContent = generateKeysFileContent(enCatalogKeys());
    const actualContent = readFileSync(path.join(__dirname, 'generated/keys.ts'), 'utf8');
    expect(actualContent).toBe(expectedContent);
  });
});
