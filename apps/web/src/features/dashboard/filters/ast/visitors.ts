/**
 * Visitor pattern implementations for the filter AST (#2194).
 *
 * Each visitor walks the AST tree and produces a different representation:
 * - toSQL: parameterized SQL WHERE clause (no injection)
 * - toURL: compressed URL string (delegated to FilterURLCodec)
 * - evaluate: client-side boolean evaluation against a FuzzingRun
 * - toJSON: JSON export
 * - toCurlCommand: cURL command string for server-side execution
 */

import type { FuzzingRun } from '@/app/types';
import type { FilterAST, FilterCondition, FilterGroup as _FilterGroup, FilterNode } from './FilterAST';
import { isCondition, isGroup } from './FilterAST';

function getRunValue(run: FuzzingRun, field: string): unknown {
  switch (field) {
    case 'id': return run.id;
    case 'status': return run.status;
    case 'area': return run.area;
    case 'severity': return run.severity;
    case 'duration': return run.duration;
    case 'seedCount': return run.seedCount;
    case 'hasCrash': return run.crashDetail !== null;
    case 'queuedAt': return run.queuedAt ?? '';
    case 'startedAt': return run.startedAt ?? '';
    case 'finishedAt': return run.finishedAt ?? '';
    default: return undefined;
  }
}

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

function toComparable(value: unknown): string | number {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return String(value);
}

/**
 * Evaluate a single condition against a FuzzingRun.
 */
export function evaluateCondition(run: FuzzingRun, condition: FilterCondition): boolean {
  const runValue = getRunValue(run, condition.field);
  if (runValue === undefined) return false;

  switch (condition.operator) {
    case 'eq':
      return toComparable(runValue) === toComparable(condition.value);
    case 'neq':
      return toComparable(runValue) !== toComparable(condition.value);
    case 'gt':
      return compareValues(runValue, condition.value) > 0;
    case 'gte':
      return compareValues(runValue, condition.value) >= 0;
    case 'lt':
      return compareValues(runValue, condition.value) < 0;
    case 'lte':
      return compareValues(runValue, condition.value) <= 0;
    case 'contains':
      return String(runValue).toLowerCase().includes(String(condition.value).toLowerCase());
    case 'not_contains':
      return !String(runValue).toLowerCase().includes(String(condition.value).toLowerCase());
    case 'in':
      return Array.isArray(condition.value) && condition.value.some(
        (v) => toComparable(runValue) === toComparable(v),
      );
    case 'not_in':
      return !(Array.isArray(condition.value) && condition.value.some(
        (v) => toComparable(runValue) === toComparable(v),
      ));
    case 'exists':
      return runValue !== undefined && runValue !== null && runValue !== '';
    case 'not_exists':
      return runValue === undefined || runValue === null || runValue === '';
    default:
      return false;
  }
}

/**
 * Recursively evaluate a group node against a FuzzingRun.
 */
export function evaluateNode(run: FuzzingRun, node: FilterNode): boolean {
  if (isCondition(node)) {
    return evaluateCondition(run, node);
  }
  if (isGroup(node)) {
    if (node.children.length === 0) return true;
    if (node.groupType === 'and') {
      return node.children.every((child) => evaluateNode(run, child));
    }
    return node.children.some((child) => evaluateNode(run, child));
  }
  return false;
}

/**
 * Evaluate the full AST against a FuzzingRun.
 */
export function evaluate(ast: FilterAST, run: FuzzingRun): boolean {
  return evaluateNode(run, ast);
}

/**
 * Client-side evaluation: filter a list of runs.
 */
export function evaluateMany(runs: FuzzingRun[], ast: FilterAST): FuzzingRun[] {
  return runs.filter((run) => evaluate(ast, run));
}

/**
 * Count matching runs.
 */
export function countMatches(runs: FuzzingRun[], ast: FilterAST): number {
  return runs.reduce((count, run) => (evaluate(ast, run) ? count + 1 : count), 0);
}

// ── SQL visitor ──────────────────────────────────────────────────────────────

function conditionToSQL(condition: FilterCondition, params: unknown[]): string {
  const paramIndex = params.length;
  switch (condition.operator) {
    case 'eq': params.push(condition.value); return `${condition.field} = $${paramIndex + 1}`;
    case 'neq': params.push(condition.value); return `${condition.field} <> $${paramIndex + 1}`;
    case 'gt': params.push(condition.value); return `${condition.field} > $${paramIndex + 1}`;
    case 'gte': params.push(condition.value); return `${condition.field} >= $${paramIndex + 1}`;
    case 'lt': params.push(condition.value); return `${condition.field} < $${paramIndex + 1}`;
    case 'lte': params.push(condition.value); return `${condition.field} <= $${paramIndex + 1}`;
    case 'contains': params.push(`%${condition.value}%`); return `${condition.field} LIKE $${paramIndex + 1}`;
    case 'not_contains': params.push(`%${condition.value}%`); return `${condition.field} NOT LIKE $${paramIndex + 1}`;
    case 'in': {
      if (Array.isArray(condition.value) && condition.value.length > 0) {
        const placeholders = condition.value.map((_, i) => `$${paramIndex + i + 1}`).join(', ');
        params.push(...condition.value);
        return `${condition.field} IN (${placeholders})`;
      }
      return '1=0';
    }
    case 'not_in': {
      if (Array.isArray(condition.value) && condition.value.length > 0) {
        const placeholders = condition.value.map((_, i) => `$${paramIndex + i + 1}`).join(', ');
        params.push(...condition.value);
        return `${condition.field} NOT IN (${placeholders})`;
      }
      return '1=1';
    }
    case 'exists': return `${condition.field} IS NOT NULL`;
    case 'not_exists': return `${condition.field} IS NULL`;
    default: return '1=1';
  }
}

function nodeToSQL(node: FilterNode, params: unknown[]): string {
  if (isCondition(node)) {
    return conditionToSQL(node, params);
  }
  if (isGroup(node)) {
    if (node.children.length === 0) return '1=1';
    const parts = node.children.map((child) => nodeToSQL(child, params));
    const connector = node.groupType === 'and' ? ' AND ' : ' OR ';
    return `(${parts.join(connector)})`;
  }
  return '1=1';
}

/**
 * Convert AST to a parameterized SQL WHERE clause.
 * Parameters are collected in the `params` array for safe parameterized queries.
 */
export function toSQL(ast: FilterAST): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const sql = nodeToSQL(ast, params);
  return { sql, params };
}

/**
 * JSON export.
 */
export function toJSON(ast: FilterAST): string {
  return JSON.stringify(ast);
}

/**
 * cURL command for server-side filter execution.
 */
export function toCurlCommand(ast: FilterAST, baseUrl: string): string {
  const body = JSON.stringify({ ast });
  return `curl -X POST ${baseUrl}/api/filters/execute \\
  -H "Content-Type: application/json" \\
  -d '${body.replace(/'/g, "'\\''")}'`;
}
