/**
 * Replay redaction rules (#2341).
 *
 * Defaults are deny-first:
 *  - input values are never recorded, only their length, unless the field
 *    (or an ancestor) opts in with `data-replay-allow` AND is not a password
 *    or otherwise denied;
 *  - elements matching a deny selector (passwords, `[data-sensitive]`,
 *    `[data-replay-block]`, autocomplete credential fields) contribute no
 *    label text at all;
 *  - all text that is kept is passed through the shared secret redactor plus
 *    PII patterns (emails, card-like numbers, Stellar secret seeds, JWTs);
 *  - URLs lose their fragment and the values of sensitive query parameters.
 *
 * The same functions run on the server for every ingested batch, so a
 * modified or outdated client cannot bypass them.
 */

import { redactText } from '@/lib/redaction';
import { LIMITS, type ElementDescriptor, type ReplayEvent } from './schema';

export interface RedactionRules {
  denySelectors: readonly string[];
  allowSelectors: readonly string[];
}

export const DEFAULT_RULES: RedactionRules = {
  denySelectors: [
    'input[type="password"]',
    '[data-sensitive]',
    '[data-replay-block]',
    '[autocomplete="cc-number"]',
    '[autocomplete="current-password"]',
    '[autocomplete="new-password"]',
    '[autocomplete="one-time-code"]',
  ],
  allowSelectors: ['[data-replay-allow]'],
};

export const MASK = '•••';

const PII_PATTERNS: Array<[RegExp, string]> = [
  [/\b(token|session(?:_?id)?|sig|signature|otp|code)=([^\s&"']+)/gi, '$1=[REDACTED]'],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]'],
  [/\bS[A-Z2-7]{55}\b/g, '[stellar-secret]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[jwt]'],
  [/\b(?:\d[ -]?){13,19}\b/g, '[number]'],
  [/\bG[A-Z2-7]{51}([A-Z2-7]{4})\b/g, 'G…$1'],
];

export function maskText(value: string, max: number = LIMITS.messageChars): string {
  let text = redactText(value);
  for (const [pattern, replacement] of PII_PATTERNS) text = text.replace(pattern, replacement);
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const SENSITIVE_PARAM = /(token|key|secret|code|sig|signature|password|auth|session|credential|email)/i;

/** Drop the fragment and mask sensitive query values. Relative URLs stay relative. */
export function redactUrl(raw: string, base = 'http://replay.local'): string {
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return maskText(raw, LIMITS.urlChars);
  }
  for (const key of [...url.searchParams.keys()]) {
    if (SENSITIVE_PARAM.test(key)) url.searchParams.set(key, '[REDACTED]');
  }
  url.hash = '';
  const sameOrigin = url.origin === new URL(base).origin;
  const path = `${url.pathname}${url.search}`.replace(/%5BREDACTED%5D/g, '[REDACTED]');
  const text = sameOrigin && !/^[a-z]+:/i.test(raw) ? path : `${url.origin}${path}`;
  return text.slice(0, LIMITS.urlChars);
}

/** Minimal element surface the recorder needs; satisfied by DOM elements and test fakes. */
export interface ElementLike {
  tagName?: string;
  id?: string;
  type?: string;
  textContent?: string | null;
  getAttribute?(name: string): string | null;
  closest?(selector: string): unknown;
  parentElement?: ElementLike | null;
}

function matchesAny(element: ElementLike, selectors: readonly string[]): boolean {
  if (typeof element.closest !== 'function') return false;
  return selectors.some((selector) => {
    try {
      return Boolean(element.closest!(selector));
    } catch {
      return false;
    }
  });
}

export function isDenied(element: ElementLike, rules: RedactionRules = DEFAULT_RULES): boolean {
  if ((element.type ?? '').toLowerCase() === 'password') return true;
  return matchesAny(element, rules.denySelectors);
}

export function isValueAllowed(element: ElementLike, rules: RedactionRules = DEFAULT_RULES): boolean {
  return !isDenied(element, rules) && matchesAny(element, rules.allowSelectors);
}

function shortSelector(element: ElementLike): string {
  const parts: string[] = [];
  let current: ElementLike | null | undefined = element;
  for (let depth = 0; current && depth < 4; depth += 1) {
    const tag = (current.tagName ?? 'node').toLowerCase();
    const testId = current.getAttribute?.('data-testid');
    const part = testId ? `${tag}[data-testid="${testId.slice(0, 40)}"]` : current.id ? `${tag}#${current.id.slice(0, 40)}` : tag;
    parts.unshift(part);
    if (testId || current.id) break;
    current = current.parentElement;
  }
  return parts.join(' > ').slice(0, 200);
}

export function describeElement(element: ElementLike, rules: RedactionRules = DEFAULT_RULES): ElementDescriptor {
  const denied = isDenied(element, rules);
  const descriptor: ElementDescriptor = {
    tag: (element.tagName ?? 'node').toLowerCase().slice(0, 20),
    selector: shortSelector(element),
  };
  if (element.id) descriptor.id = element.id.slice(0, 80);
  const testId = element.getAttribute?.('data-testid');
  if (testId) descriptor.testId = testId.slice(0, 80);
  const role = element.getAttribute?.('role');
  if (role) descriptor.role = role.slice(0, 40);
  if (!denied) {
    const tag = descriptor.tag;
    const raw =
      element.getAttribute?.('aria-label') ??
      (tag === 'input' || tag === 'textarea' || tag === 'select' ? element.getAttribute?.('name') ?? element.getAttribute?.('placeholder') : element.textContent) ??
      '';
    const label = maskText(raw ?? '', LIMITS.labelChars);
    if (label) descriptor.label = label;
  } else {
    descriptor.label = MASK;
  }
  return descriptor;
}

function scrubDescriptor(descriptor: ElementDescriptor): ElementDescriptor {
  return { ...descriptor, ...(descriptor.label ? { label: maskText(descriptor.label, LIMITS.labelChars) } : {}) };
}

/**
 * Server-side defense in depth: re-mask every free-text field of an event.
 * Idempotent, so re-applying it to already-clean events changes nothing.
 */
export function scrubEvent(event: ReplayEvent): ReplayEvent {
  switch (event.type) {
    case 'navigation':
      return { ...event, route: redactUrl(event.route), from: event.from ? redactUrl(event.from) : null };
    case 'click':
    case 'submit':
      return { ...event, target: scrubDescriptor(event.target) };
    case 'input': {
      const { value, ...rest } = event;
      return { ...rest, target: scrubDescriptor(event.target), ...(value !== undefined ? { value: maskText(value, LIMITS.labelChars) } : {}) };
    }
    case 'network':
      return { ...event, url: redactUrl(event.url) };
    case 'console':
      return { ...event, message: maskText(event.message) };
    case 'error':
      return {
        ...event,
        message: maskText(event.message),
        ...(event.stack ? { stack: maskText(event.stack, LIMITS.stackChars) } : {}),
      };
    case 'state':
      return { ...event, summary: maskText(event.summary) };
    case 'mark':
      return { ...event, label: maskText(event.label, LIMITS.labelChars) };
    default:
      return event;
  }
}
