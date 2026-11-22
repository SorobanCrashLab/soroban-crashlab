#!/usr/bin/env node
/**
 * Regenerates `src/i18n/generated/keys.ts` — the compile-time union of valid
 * `t()` keys — from the `en` catalogs (the source of truth). Run via
 * `pnpm run i18n:generate` whenever a catalog namespace changes.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flattenCatalogKeys, generateKeysFileContent } from './lib/i18n-codegen.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');
const enCatalogDir = path.join(webRoot, 'src/i18n/catalogs/en');
const outFile = path.join(webRoot, 'src/i18n/generated/keys.ts');

const namespaceFiles = readdirSync(enCatalogDir).filter((file) => file.endsWith('.json'));

let allKeys = [];
for (const file of namespaceFiles) {
  const namespace = path.basename(file, '.json');
  const catalog = JSON.parse(readFileSync(path.join(enCatalogDir, file), 'utf8'));
  allKeys = allKeys.concat(flattenCatalogKeys(catalog, namespace));
}
allKeys.sort();

mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, generateKeysFileContent(allKeys), 'utf8');

console.log(`Generated ${allKeys.length} message keys -> ${path.relative(webRoot, outFile)}`);
