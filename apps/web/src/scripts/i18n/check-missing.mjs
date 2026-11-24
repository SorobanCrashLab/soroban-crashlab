#!/usr/bin/env node
/**
 * Check for missing i18n keys (issue #2261 Phase 3).
 * 
 * Exits non-zero if any keys are missing in non-default locales.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalogsDir = path.resolve(__dirname, '../../src/i18n/catalogs');

const DEFAULT_LOCALE = 'en';
const LOCALES = ['en', 'es', 'en-XA'];

function loadCatalog(locale, namespace) {
  const filePath = path.join(catalogsDir, locale, `${namespace}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getAllKeys(obj, prefix = '') {
  const keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
      keys.push(...getAllKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

function checkMissingKeys() {
  const namespaces = fs.readdirSync(path.join(catalogsDir, DEFAULT_LOCALE))
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));

  let hasErrors = false;

  for (const namespace of namespaces) {
    const defaultCatalog = loadCatalog(DEFAULT_LOCALE, namespace);
    if (!defaultCatalog) continue;

    const defaultKeys = getAllKeys(defaultCatalog);

    for (const locale of LOCALES) {
      if (locale === DEFAULT_LOCALE) continue;

      const localeCatalog = loadCatalog(locale, namespace);
      if (!localeCatalog) {
        console.error(`❌ Missing catalog: ${locale}/${namespace}.json`);
        hasErrors = true;
        continue;
      }

      const localeKeys = getAllKeys(localeCatalog);
      const missing = defaultKeys.filter(k => !localeKeys.includes(k));

      if (missing.length > 0) {
        console.error(`❌ Missing keys in ${locale}/${namespace}.json:`);
        missing.forEach(k => console.error(`   - ${k}`));
        hasErrors = true;
      }
    }
  }

  if (hasErrors) {
    console.error('\n❌ i18n validation failed');
    process.exit(1);
  } else {
    console.log('✅ All i18n keys present');
    process.exit(0);
  }
}

checkMissingKeys();
