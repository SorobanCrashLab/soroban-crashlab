/** AST evaluator for structured log queries (#075). Pure and isomorphic. */

import type { QueryNode } from './parser';
import type { LogEvent } from '@/lib/logs/types';

function fieldValue(event: LogEvent, field: string): string | number | boolean | undefined {
  switch (field.toLowerCase()) {
    case 'level': return event.level;
    case 'source': return event.source;
    case 'contract': return event.contract;
    case 'run_id': return event.run_id;
    case 'campaign_id': return event.campaign_id;
    case 'trace_id': return event.trace_id;
    case 'span_id': return event.span_id;
    case 'error_code': return event.error_code;
    case 'incident_id': return event.incident_id;
    case 'artifact_id': return event.artifact_id;
    case 'message': return event.message;
    case 'timestamp': return event.timestamp;
    default:
      return event.attributes[field] ?? event.attributes[field.toLowerCase()];
  }
}

function freeTextValues(event: LogEvent): string[] {
  return [
    event.level,
    event.source,
    event.message,
    event.contract ?? '',
    event.run_id ?? '',
    event.campaign_id ?? '',
    event.trace_id ?? '',
    event.error_code ?? '',
    ...Object.values(event.attributes).map(String),
  ];
}

/** Translate a glob-like pattern (`fuzz-*`, `INV-??`) into an anchored regex. */
export function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

function compareNumbersOrStrings(
  actual: string | number | boolean,
  expected: string,
): number {
  const actualNumber = typeof actual === 'number' ? actual : Number(actual);
  const expectedNumber = Number(expected);
  if (!Number.isNaN(actualNumber) && !Number.isNaN(expectedNumber) && expected.trim() !== '') {
    return actualNumber - expectedNumber;
  }
  return String(actual).toLowerCase().localeCompare(expected.toLowerCase());
}

function compareTimestamp(actual: string | number | boolean, expected: string): number {
  const numeric = typeof actual === 'number' ? actual : Number(actual);
  const parsed = Date.parse(expected);
  if (!Number.isNaN(numeric) && (expected.trim() !== '' && !Number.isNaN(Number(expected)))) {
    return numeric - Number(expected);
  }
  if (!Number.isNaN(parsed)) return numeric - parsed;
  return String(actual).localeCompare(expected);
}

function evaluateTerm(event: LogEvent, node: Extract<QueryNode, { kind: 'term' }>): boolean {
  const candidates = node.field
    ? [fieldValue(event, node.field)]
    : freeTextValues(event);

  return candidates.some((candidate) => {
    if (candidate === undefined) return false;
    const actual = String(candidate);
    const expected = node.value;

    switch (node.operator) {
      case ':':
        if (expected.includes('*') || expected.includes('?')) {
          return wildcardToRegExp(expected).test(actual);
        }
        if (node.field === 'timestamp') return compareTimestamp(candidate, expected) === 0;
        return actual.toLowerCase().includes(expected.toLowerCase());
      case '=':
        if (node.field === 'timestamp') return compareTimestamp(candidate, expected) === 0;
        return actual.toLowerCase() === expected.toLowerCase();
      case '!=':
        if (node.field === 'timestamp') return compareTimestamp(candidate, expected) !== 0;
        return actual.toLowerCase() !== expected.toLowerCase();
      case '~':
        try {
          return new RegExp(expected, 'i').test(actual);
        } catch {
          return actual.toLowerCase().includes(expected.toLowerCase());
        }
      case '>':
      case '>=':
      case '<':
      case '<=': {
        const result = node.field === 'timestamp'
          ? compareTimestamp(candidate, expected)
          : compareNumbersOrStrings(candidate, expected);
        if (node.operator === '>') return result > 0;
        if (node.operator === '>=') return result >= 0;
        if (node.operator === '<') return result < 0;
        return result <= 0;
      }
      default:
        return false;
    }
  });
}

function evaluateRange(event: LogEvent, node: Extract<QueryNode, { kind: 'range' }>): boolean {
  const actual = fieldValue(event, node.field);
  if (actual === undefined) return false;
  const compare = node.field.toLowerCase() === 'timestamp' ? compareTimestamp : compareNumbersOrStrings;
  const from = compare(actual, node.from);
  const to = compare(actual, node.to);
  const inside = (node.includeFrom ? from >= 0 : from > 0) && (node.includeTo ? to <= 0 : to < 0);
  return node.negated ? !inside : inside;
}

/** Evaluate a parsed AST against one event. */
export function matchesQuery(event: LogEvent, node: QueryNode): boolean {
  switch (node.kind) {
    case 'match_all': return true;
    case 'term': {
      const matched = evaluateTerm(event, node);
      return node.negated ? !matched : matched;
    }
    case 'range': return evaluateRange(event, node);
    case 'not': return !matchesQuery(event, node.child);
    case 'and': return node.children.every((child) => matchesQuery(event, child));
    case 'or': return node.children.some((child) => matchesQuery(event, child));
    default: return false;
  }
}

/** Extract literal field constraints; used for server-side index hints. */
export function queryIndexHints(node: QueryNode): Record<string, string[]> {
  const hints: Record<string, string[]> = {};
  const visit = (current: QueryNode): void => {
    if (current.kind === 'term' && current.field && current.operator === ':' && !current.value.includes('*')) {
      const key = current.field.toLowerCase();
      hints[key] = [...new Set([...(hints[key] ?? []), current.value.toLowerCase()])];
    }
    if (current.kind === 'and') current.children.forEach(visit);
    if (current.kind === 'not') return;
    if (current.kind === 'or') {
      // Only values shared across every branch are safe as an index hint.
      const branchHints = current.children.map(queryIndexHints);
      for (const key of Object.keys(branchHints[0] ?? {})) {
        if (branchHints.every((branch) => branch[key]?.length === 1 && branch[key][0] === branchHints[0][key][0])) {
          hints[key] = branchHints[0][key];
        }
      }
    }
  };
  visit(node);
  return hints;
}
