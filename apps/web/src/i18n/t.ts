/**
 * Type-safe `t(key, params?)` message accessor with ICU-lite interpolation.
 *
 * Supported subset (documented here, not "full ICU" — see issue #1441):
 *  - Plain interpolation:      "Hello {name}"
 *  - Plural:                   "{count, plural, one {# item} other {# items}}"
 *  - Select:                   "{status, select, active {Active} other {Unknown}}"
 * `#` inside a plural case body is replaced with the resolved count.
 * Anything else (nested/full ICU) is left as literal `{...}` text.
 */
import type { MessageKey } from './generated/keys';

export type TranslationParams = Record<string, string | number>;

type CaseMap = Record<string, string>;

function findMatchingBrace(template: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < template.length; i++) {
    if (template[i] === '{') depth += 1;
    else if (template[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error(`Unbalanced braces in i18n template: ${template}`);
}

function parseCases(raw: string): CaseMap {
  const cases: CaseMap = {};
  let i = 0;
  while (i < raw.length) {
    while (i < raw.length && /\s/.test(raw[i])) i += 1;
    if (i >= raw.length) break;
    const labelStart = i;
    while (i < raw.length && raw[i] !== '{') i += 1;
    const label = raw.slice(labelStart, i).trim();
    if (raw[i] !== '{') break;
    const end = findMatchingBrace(raw, i);
    cases[label] = raw.slice(i + 1, end);
    i = end + 1;
  }
  return cases;
}

function handleMissingParam(name: string, fallback: string, isDev: boolean): string {
  if (isDev) {
    throw new Error(`Missing i18n interpolation param "${name}"`);
  }
  // Production: never crash the page over a missing param — show the
  // placeholder so it's visibly wrong without breaking the surrounding UI.
  return fallback;
}

function resolveToken(inner: string, params: TranslationParams, isDev: boolean): string {
  const commaIndex = inner.indexOf(',');
  if (commaIndex === -1) {
    const name = inner.trim();
    if (!(name in params)) {
      return handleMissingParam(name, `{${name}}`, isDev);
    }
    return String(params[name]);
  }

  const name = inner.slice(0, commaIndex).trim();
  const rest = inner.slice(commaIndex + 1).trim();
  const kindCommaIndex = rest.indexOf(',');
  const kind = (kindCommaIndex === -1 ? rest : rest.slice(0, kindCommaIndex)).trim();
  const casesRaw = kindCommaIndex === -1 ? '' : rest.slice(kindCommaIndex + 1).trim();

  if (kind !== 'plural' && kind !== 'select') {
    // Unsupported ICU construct: leave visibly untouched rather than guess.
    return `{${inner}}`;
  }

  const cases = parseCases(casesRaw);
  const rawValue = params[name];

  if (kind === 'plural') {
    const count = Number(rawValue);
    if (!Number.isFinite(count)) {
      return handleMissingParam(name, `{${inner}}`, isDev);
    }
    const category = count === 1 ? 'one' : 'other';
    const body = cases[category] ?? cases.other ?? '';
    return translateTemplate(body, params, isDev).split('#').join(String(count));
  }

  // select
  const key = rawValue !== undefined ? String(rawValue) : undefined;
  const body = (key !== undefined ? cases[key] : undefined) ?? cases.other ?? '';
  return translateTemplate(body, params, isDev);
}

export function translateTemplate(template: string, params: TranslationParams, isDev: boolean): string {
  let result = '';
  let i = 0;
  while (i < template.length) {
    if (template[i] === '{') {
      const end = findMatchingBrace(template, i);
      result += resolveToken(template.slice(i + 1, end), params, isDev);
      i = end + 1;
    } else {
      result += template[i];
      i += 1;
    }
  }
  return result;
}

function getByPath(obj: Record<string, unknown>, keyPath: string): unknown {
  return keyPath.split('.').reduce<unknown>((acc, segment) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[segment];
    }
    return undefined;
  }, obj);
}

export interface CreateTranslatorOptions {
  /** Overrides the dev/prod behavior for missing keys/params. Defaults to `NODE_ENV !== 'production'`. */
  isDev?: boolean;
}

export function createTranslator(messages: Record<string, unknown>, options: CreateTranslatorOptions = {}) {
  const isDev = options.isDev ?? process.env.NODE_ENV !== 'production';

  return function t<K extends MessageKey>(key: K, params: TranslationParams = {}): string {
    const template = getByPath(messages, key);
    if (typeof template !== 'string') {
      if (isDev) {
        throw new Error(`Missing i18n message for key "${key}"`);
      }
      return key;
    }
    return translateTemplate(template, params, isDev);
  };
}

export type Translate = ReturnType<typeof createTranslator>;
