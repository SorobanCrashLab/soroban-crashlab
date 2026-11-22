/**
 * Compiles a parsed query into a predicate over runs (#1432).
 *
 * Values are DATA throughout: the compiler closes over the literal string and
 * compares it. Nothing is ever passed to `eval`, `Function`, or a `RegExp`
 * built from user input, so a hostile query has no code path to reach.
 */

import type { FuzzingRun } from '../../types';
import { findField, fieldNames, ISO_DATE, type FieldSpec } from './fields';
import { QueryError } from './lexer';
import { parseQuery, type ComparisonOperator, type QueryNode } from './parser';

export type RunPredicate = (run: FuzzingRun) => boolean;

/** Raw value read off a run for a given field. */
function readField(run: FuzzingRun, field: FieldSpec): unknown {
  switch (field.name) {
    case 'id':
      return run.id;
    case 'status':
      return run.status;
    case 'area':
      return run.area;
    case 'severity':
      return run.severity;
    case 'duration':
      return run.duration;
    case 'seeds':
      return run.seedCount;
    case 'cpu':
      return run.cpuInstructions;
    case 'memory':
      return run.memoryBytes;
    case 'fee':
      return run.minResourceFee;
    case 'queued':
      return run.queuedAt;
    case 'started':
      return run.startedAt;
    case 'finished':
      return run.finishedAt;
    case 'tag':
      return run.tags ?? [];
    case 'crash':
      return run.crashDetail !== null;
    case 'category':
      return run.crashDetail?.failureCategory;
    case 'signature':
      return run.crashDetail?.signature;
    default:
      return undefined;
  }
}

function compareNumbers(actual: number, operator: ComparisonOperator, expected: number): boolean {
  switch (operator) {
    case ':':
      return actual === expected;
    case '>':
      return actual > expected;
    case '>=':
      return actual >= expected;
    case '<':
      return actual < expected;
    case '<=':
      return actual <= expected;
  }
}

function substringMatch(haystack: unknown, needle: string): boolean {
  if (haystack === null || haystack === undefined) return false;
  if (Array.isArray(haystack)) {
    return haystack.some((item) => substringMatch(item, needle));
  }
  return String(haystack).toLowerCase().includes(needle.toLowerCase());
}

function compileFieldTerm(node: Extract<QueryNode, { type: 'field' }>): RunPredicate {
  const field = findField(node.field);
  if (!field) {
    throw new QueryError(
      `Unknown field "${node.field}".`,
      node.position,
      fieldNames(),
    );
  }

  const { operator, value } = node;

  if (field.kind === 'number') {
    const expected = Number(value);
    if (!Number.isFinite(expected)) {
      throw new QueryError(
        `"${node.field}" expects a number but got "${value}".`,
        node.position,
        ['a number'],
      );
    }
    return (run) => {
      const actual = readField(run, field);
      return typeof actual === 'number' && compareNumbers(actual, operator, expected);
    };
  }

  if (field.kind === 'date') {
    if (!ISO_DATE.test(value)) {
      throw new QueryError(
        `"${node.field}" expects an ISO date such as 2026-08-01, but got "${value}".`,
        node.position,
        ['YYYY-MM-DD', 'YYYY-MM-DDTHH:MM:SSZ'],
      );
    }
    const expected = Date.parse(value);
    return (run) => {
      const actual = readField(run, field);
      if (typeof actual !== 'string') return false;
      const parsed = Date.parse(actual);
      return Number.isFinite(parsed) && compareNumbers(parsed, operator, expected);
    };
  }

  if (operator !== ':') {
    throw new QueryError(
      `"${node.field}" only supports ":" — comparisons apply to numeric and date fields.`,
      node.position,
      [':'],
    );
  }

  if (field.kind === 'boolean') {
    if (value !== 'true' && value !== 'false') {
      throw new QueryError(
        `"${node.field}" expects true or false but got "${value}".`,
        node.position,
        ['true', 'false'],
      );
    }
    const expected = value === 'true';
    return (run) => readField(run, field) === expected;
  }

  if (field.kind === 'enum' && field.values && !field.values.includes(value.toLowerCase())) {
    throw new QueryError(
      `"${value}" is not a valid ${node.field}.`,
      node.position,
      [...field.values],
    );
  }

  return (run) => substringMatch(readField(run, field), value);
}

/** Free text still searches the fields the legacy substring search covered. */
function compileFreeText(value: string): RunPredicate {
  const needle = value.toLowerCase();
  return (run) =>
    [
      run.id,
      run.status,
      run.area,
      run.severity,
      run.crashDetail?.failureCategory,
      run.crashDetail?.signature,
      ...(run.tags ?? []),
    ].some((candidate) => candidate !== undefined && String(candidate).toLowerCase().includes(needle));
}

export function compileNode(node: QueryNode): RunPredicate {
  switch (node.type) {
    case 'and': {
      const children = node.children.map(compileNode);
      return (run) => children.every((predicate) => predicate(run));
    }
    case 'or': {
      const children = node.children.map(compileNode);
      return (run) => children.some((predicate) => predicate(run));
    }
    case 'not': {
      const child = compileNode(node.child);
      return (run) => !child(run);
    }
    case 'field':
      return compileFieldTerm(node);
    case 'text':
      return compileFreeText(node.value);
  }
}

export function compileQuery(input: string): RunPredicate {
  return compileNode(parseQuery(input));
}

/**
 * Whether the input uses any grammar construct. A query with none of them
 * keeps the pre-existing whole-input substring behaviour, so bookmarked plain
 * searches return exactly what they did before.
 */
export function usesGrammar(input: string): boolean {
  return /(^|\s)-\S/.test(input) || /[():<>"]/.test(input) || /\s\bOR\b\s/.test(input) || /\S:\S/.test(input);
}

export interface SearchOutcome {
  runs: FuzzingRun[];
  error?: QueryError;
  /** True when the legacy substring path handled the query. */
  usedFallback: boolean;
}

/**
 * The search entry point: grammar when the input uses it, legacy substring
 * otherwise, and a precise error instead of a silent empty result.
 */
export function searchRuns(runs: readonly FuzzingRun[], input: string): SearchOutcome {
  const trimmed = input.trim();
  if (!trimmed) return { runs: [...runs], usedFallback: true };

  if (!usesGrammar(trimmed)) {
    const predicate = compileFreeText(trimmed);
    return { runs: runs.filter(predicate), usedFallback: true };
  }

  try {
    const predicate = compileQuery(trimmed);
    return { runs: runs.filter(predicate), usedFallback: false };
  } catch (error) {
    if (error instanceof QueryError) {
      return { runs: [], error, usedFallback: false };
    }
    throw error;
  }
}

export { QueryError };
