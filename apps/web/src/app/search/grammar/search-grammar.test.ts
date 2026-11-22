import { describe, expect, it } from 'vitest';
import { caretLine, QueryError, tokenize } from './lexer';
import { parseQuery } from './parser';
import { compileQuery, searchRuns, usesGrammar } from './compiler';
import { fieldNames, findField, suggestFields } from './fields';
import type { FuzzingRun } from '../../types';

const run = (overrides: Partial<FuzzingRun> = {}): FuzzingRun => ({
  id: 'run-1',
  status: 'completed',
  area: 'auth',
  severity: 'low',
  duration: 1000,
  seedCount: 10,
  crashDetail: null,
  cpuInstructions: 500,
  memoryBytes: 1024,
  minResourceFee: 50,
  queuedAt: '2026-08-01T00:00:00.000Z',
  ...overrides,
});

const RUNS: FuzzingRun[] = [
  run({ id: 'run-1', status: 'failed', area: 'auth', minResourceFee: 250, queuedAt: '2026-08-10T00:00:00.000Z' }),
  run({ id: 'run-2', status: 'completed', area: 'state', minResourceFee: 50, queuedAt: '2026-07-01T00:00:00.000Z' }),
  run({
    id: 'run-3',
    status: 'failed',
    area: 'budget',
    minResourceFee: 900,
    queuedAt: '2026-08-20T00:00:00.000Z',
    tags: ['regression'],
    crashDetail: {
      failureCategory: 'overflow',
      signature: 'sig-abc',
      payload: 'p',
      replayAction: 'r',
    },
  }),
];

const ids = (runs: FuzzingRun[]) => runs.map((entry) => entry.id);

describe('lexer', () => {
  it('records a source span for every token', () => {
    const tokens = tokenize('status:failed');
    expect(tokens.map((token) => [token.type, token.value, token.start, token.end])).toEqual([
      ['word', 'status', 0, 6],
      ['colon', ':', 6, 7],
      ['word', 'failed', 7, 13],
      ['eof', '', 13, 13],
    ]);
  });

  it('lexes every comparison operator', () => {
    expect(tokenize('a>1 b>=2 c<3 d<=4').filter((t) => t.type !== 'word' && t.type !== 'eof').map((t) => t.type))
      .toEqual(['gt', 'gte', 'lt', 'lte']);
  });

  it('treats a dash inside a word or date as a literal character', () => {
    expect(tokenize('since:2026-08-01').map((t) => t.value)).toEqual([
      'since',
      ':',
      '2026-08-01',
      '',
    ]);
    expect(tokenize('run-1').map((t) => t.type)).toEqual(['word', 'eof']);
  });

  it('treats a leading dash as negation', () => {
    expect(tokenize('-status:failed')[0].type).toBe('minus');
    expect(tokenize('a -b').map((t) => t.type)).toEqual(['word', 'minus', 'word', 'eof']);
  });

  it('reads quoted phrases and keeps their contents intact', () => {
    const [token] = tokenize('"auth failure: retry"');
    expect(token.type).toBe('phrase');
    expect(token.value).toBe('auth failure: retry');
  });

  it('rejects an unterminated phrase at its opening quote', () => {
    try {
      tokenize('status:failed "oops');
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(QueryError);
      expect((error as QueryError).position).toBe(14);
    }
  });

  it('renders a caret under the offending position', () => {
    expect(caretLine('abc', 1)).toBe('abc\n ^');
  });
});

describe('parser', () => {
  it('builds a field term with its operator', () => {
    expect(parseQuery('fee>100')).toEqual({
      type: 'field',
      field: 'fee',
      operator: '>',
      value: '100',
      position: 0,
    });
  });

  it('treats adjacent terms as implicit AND', () => {
    const node = parseQuery('status:failed area:auth');
    expect(node.type).toBe('and');
    if (node.type !== 'and') return;
    expect(node.children).toHaveLength(2);
  });

  it('parses OR groups and parentheses', () => {
    const node = parseQuery('(status:failed OR status:cancelled) area:auth');
    expect(node.type).toBe('and');
    if (node.type !== 'and') return;
    expect(node.children[0].type).toBe('or');
  });

  it('parses negation', () => {
    expect(parseQuery('-status:failed').type).toBe('not');
  });

  it('reports an unclosed group with a caret position', () => {
    try {
      parseQuery('(status:failed');
      throw new Error('should have thrown');
    } catch (error) {
      const queryError = error as QueryError;
      expect(queryError.message).toBe('Unclosed group.');
      expect(queryError.position).toBe(14);
      expect(queryError.expected).toContain(')');
    }
  });

  it('reports a missing value after an operator', () => {
    try {
      parseQuery('fee>');
      throw new Error('should have thrown');
    } catch (error) {
      const queryError = error as QueryError;
      expect(queryError.message).toBe('Expected a value after "fee>".');
      expect(queryError.position).toBe(4);
      expect(queryError.expected).toContain('a value');
    }
  });

  it('reports a stray closing parenthesis', () => {
    expect(() => parseQuery('status:failed )')).toThrow(QueryError);
  });
});

describe('compiler', () => {
  it('filters by enum equality', () => {
    expect(ids(RUNS.filter(compileQuery('status:failed')))).toEqual(['run-1', 'run-3']);
  });

  it('applies numeric comparisons', () => {
    expect(ids(RUNS.filter(compileQuery('fee>100')))).toEqual(['run-1', 'run-3']);
    expect(ids(RUNS.filter(compileQuery('fee>=250')))).toEqual(['run-1', 'run-3']);
    expect(ids(RUNS.filter(compileQuery('fee<100')))).toEqual(['run-2']);
    expect(ids(RUNS.filter(compileQuery('fee<=50')))).toEqual(['run-2']);
    expect(ids(RUNS.filter(compileQuery('fee:900')))).toEqual(['run-3']);
  });

  it('applies ISO date comparisons', () => {
    expect(ids(RUNS.filter(compileQuery('queued>2026-08-01')))).toEqual(['run-1', 'run-3']);
    expect(ids(RUNS.filter(compileQuery('queued<2026-08-01')))).toEqual(['run-2']);
  });

  it('combines terms with implicit AND', () => {
    expect(ids(RUNS.filter(compileQuery('status:failed area:auth')))).toEqual(['run-1']);
  });

  it('honours OR groups and negation', () => {
    expect(ids(RUNS.filter(compileQuery('area:auth OR area:budget')))).toEqual(['run-1', 'run-3']);
    expect(ids(RUNS.filter(compileQuery('status:failed -area:auth')))).toEqual(['run-3']);
    expect(ids(RUNS.filter(compileQuery('(area:auth OR area:state) -status:failed')))).toEqual(['run-2']);
  });

  it('matches boolean and array-valued fields', () => {
    expect(ids(RUNS.filter(compileQuery('crash:true')))).toEqual(['run-3']);
    expect(ids(RUNS.filter(compileQuery('tag:regression')))).toEqual(['run-3']);
  });

  it('rejects an unknown field and offers the whitelist', () => {
    try {
      compileQuery('nope:1');
      throw new Error('should have thrown');
    } catch (error) {
      const queryError = error as QueryError;
      expect(queryError.message).toBe('Unknown field "nope".');
      expect(queryError.expected).toEqual(fieldNames());
    }
  });

  it('rejects a non-numeric value for a numeric field', () => {
    expect(() => compileQuery('fee>lots')).toThrow(/expects a number/);
  });

  it('rejects a natural-language date, ISO only in v1', () => {
    expect(() => compileQuery('queued>yesterday')).toThrow(/ISO date/);
    expect(() => compileQuery('queued>"last tuesday"')).toThrow(/ISO date/);
  });

  it('rejects an invalid enum value and lists the valid ones', () => {
    try {
      compileQuery('status:exploded');
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as QueryError).expected).toEqual(['running', 'completed', 'failed', 'cancelled']);
    }
  });

  it('rejects a comparison operator on a string field', () => {
    expect(() => compileQuery('id>run-1')).toThrow(/only supports ":"/);
  });
});

describe('injection safety', () => {
  const hostile = [
    'id:"__proto__"',
    'id:constructor',
    'id:"); process.exit(1); //"',
    'id:"${process.env.SECRET}"',
    'id:"<script>alert(1)</script>"',
    'id:".*"',
    'id:"(((((((((((("',
    "id:'; DROP TABLE runs; --",
  ];

  it('treats every hostile value as literal data', () => {
    for (const query of hostile) {
      // Either it parses and matches nothing, or it is a clean QueryError.
      // What it must never do is execute or throw something unexpected.
      try {
        const result = searchRuns(RUNS, query);
        expect(result.runs).toEqual([]);
      } catch (error) {
        expect(error).toBeInstanceOf(QueryError);
      }
    }
  });

  it('does not treat a regex-special value as a pattern', () => {
    const withDot = [run({ id: 'axb' }), run({ id: 'a.b' })];
    expect(ids(withDot.filter(compileQuery('id:"a.b"')))).toEqual(['a.b']);
  });

  it('leaves prototype pollution attempts inert', () => {
    searchRuns(RUNS, 'id:"__proto__" tag:"constructor"');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('behaviour preservation', () => {
  it('detects grammar constructs only when present', () => {
    expect(usesGrammar('auth failure')).toBe(false);
    expect(usesGrammar('run-1')).toBe(false);
    expect(usesGrammar('status:failed')).toBe(true);
    expect(usesGrammar('fee>10')).toBe(true);
    expect(usesGrammar('a OR b')).toBe(true);
    expect(usesGrammar('-auth')).toBe(true);
    expect(usesGrammar('"exact phrase"')).toBe(true);
  });

  it('falls back to substring search for a plain query', () => {
    const outcome = searchRuns(RUNS, 'auth');
    expect(outcome.usedFallback).toBe(true);
    expect(ids(outcome.runs)).toEqual(['run-1']);
  });

  it('returns every run for an empty query, as before', () => {
    expect(searchRuns(RUNS, '   ').runs).toHaveLength(RUNS.length);
  });

  it('surfaces an error instead of a silent zero-result', () => {
    const outcome = searchRuns(RUNS, 'nope:1');
    expect(outcome.runs).toEqual([]);
    expect(outcome.error).toBeInstanceOf(QueryError);
    expect(outcome.error?.position).toBe(0);
  });
});

describe('autocomplete hints', () => {
  it('suggests fields by prefix', () => {
    expect(suggestFields('se').map((field) => field.name)).toEqual(['seeds', 'severity']);
    expect(suggestFields('').length).toBe(fieldNames().length);
  });

  it('resolves a field case-insensitively', () => {
    expect(findField('STATUS')?.name).toBe('status');
    expect(findField('nope')).toBeUndefined();
  });
});

describe('performance', () => {
  it('filters 10k runs with a complex query in under 50ms', () => {
    const many = Array.from({ length: 10_000 }, (_, index) =>
      run({
        id: `run-${index}`,
        status: index % 3 === 0 ? 'failed' : 'completed',
        area: index % 2 === 0 ? 'auth' : 'state',
        minResourceFee: index % 1000,
        queuedAt: `2026-08-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
      }),
    );
    const query = '(status:failed OR status:cancelled) area:auth fee>100 queued>=2026-08-05 -id:run-9999';

    const started = performance.now();
    const outcome = searchRuns(many, query);
    const elapsed = performance.now() - started;

    expect(outcome.error).toBeUndefined();
    expect(elapsed).toBeLessThan(50);
  });
});
