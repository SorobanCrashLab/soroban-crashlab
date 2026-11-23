/**
 * Structured log query DSL parser (#075).
 *
 * The parser is deliberately dependency-free: the same module runs in the
 * browser (autocomplete, validation, highlighting) and on the server (search
 * API). It produces a lossless token stream for editors plus an AST used by
 * the evaluator and the deterministic serializer.
 *
 * Supported syntax:
 *   level:error                 equality (case-insensitive for known fields)
 *   source:fuzz-worker          exact or wildcard value (`fuzz-*`)
 *   message:"RPC timeout"       quoted phrase
 *   latency:>=800               numeric / lexicographic comparisons
 *   timestamp:[<t1> TO <t2>]    inclusive range, `{...}` for exclusive
 *   level:error AND NOT source:rpc   boolean logic, `!` / `-` also negate
 *   (run_id:r-1 OR run_id:r-2) AND error_code:INV-*
 *   free text                   searched across message, source and attributes
 */

export const LOG_FIELDS = [
  'level',
  'source',
  'contract',
  'run_id',
  'campaign_id',
  'trace_id',
  'span_id',
  'error_code',
  'incident_id',
  'artifact_id',
  'message',
  'timestamp',
] as const;

export type LogFieldName = (typeof LOG_FIELDS)[number];

export const FIELD_OPERATORS = [':', '=', '!=', '~', '>=', '<=', '>', '<'] as const;
export type FieldOperator = (typeof FIELD_OPERATORS)[number];

export const BOOLEAN_KEYWORDS = ['AND', 'OR', 'NOT'] as const;

export interface SourceSpan {
  start: number;
  end: number;
}

export type TokenKind =
  | 'field'
  | 'operator'
  | 'value'
  | 'keyword'
  | 'range'
  | 'paren'
  | 'whitespace'
  | 'comment';

export interface QueryToken {
  kind: TokenKind;
  value: string;
  span: SourceSpan;
}

export type QueryNode =
  | {
      kind: 'term';
      field: string | null;
      operator: FieldOperator;
      value: string;
      negated: boolean;
      span: SourceSpan;
    }
  | {
      kind: 'range';
      field: string;
      from: string;
      to: string;
      includeFrom: boolean;
      includeTo: boolean;
      negated: boolean;
      span: SourceSpan;
    }
  | { kind: 'and' | 'or'; children: QueryNode[]; span: SourceSpan }
  | { kind: 'not'; child: QueryNode; span: SourceSpan }
  | { kind: 'match_all'; span: SourceSpan };

export type DiagnosticSeverity = 'error' | 'warning';

export interface QueryDiagnostic {
  severity: DiagnosticSeverity;
  message: string;
  span: SourceSpan;
}

export interface ParsedQuery {
  source: string;
  tokens: QueryToken[];
  ast: QueryNode;
  diagnostics: QueryDiagnostic[];
  valid: boolean;
}

const OPERATOR_PREFIXES: FieldOperator[] = ['!=', '>=', '<=', ':', '=', '~', '>', '<'];

function isWhitespace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}

function isParen(char: string): boolean {
  return char === '(' || char === ')';
}

function knownField(value: string): value is LogFieldName {
  return (LOG_FIELDS as readonly string[]).includes(value.toLowerCase());
}

/** Split a `field:op value` style word into its constituent parts. */
export function splitFieldExpression(raw: string): {
  field: string;
  operator: FieldOperator;
  value: string;
} | null {
  const rangeMatch = /^([A-Za-z_][\w.]*)([!=<>~:]?)(\[[^\]]*\]|\{[^}]*\})$/.exec(raw);
  if (rangeMatch) {
    return {
      field: rangeMatch[1],
      operator: rangeMatch[2] === '!=' ? '!=' : rangeMatch[2] === ':' || rangeMatch[2] === '' ? ':' : (rangeMatch[2] as FieldOperator),
      value: rangeMatch[3],
    };
  }

  // `field:>=value` is shorthand for the `>=` operator with the colon omitted.
  const colonAt = raw.indexOf(':');
  if (colonAt > 0) {
    const afterColon = raw.slice(colonAt + 1);
    for (const operator of OPERATOR_PREFIXES) {
      if (operator === ':') continue;
      if (!afterColon.startsWith(operator)) continue;
      return { field: raw.slice(0, colonAt), operator, value: afterColon.slice(operator.length) };
    }
  }

  for (const operator of OPERATOR_PREFIXES) {
    const index = raw.indexOf(operator);
    if (index <= 0) continue;
    const field = raw.slice(0, index);
    if (!/^[A-Za-z_][\w.]*$/.test(field)) continue;
    return { field, operator, value: raw.slice(index + operator.length) };
  }
  return null;
}

/**
 * Tokenize a query. Every character is accounted for by exactly one token,
 * which lets editors colorize the entire input without gaps.
 */
export function tokenizeQuery(source: string): QueryToken[] {
  const tokens: QueryToken[] = [];
  let index = 0;

  const push = (kind: TokenKind, start: number, end: number): void => {
    if (end > start) tokens.push({ kind, value: source.slice(start, end), span: { start, end } });
  };

  while (index < source.length) {
    const char = source[index];
    if (isWhitespace(char)) {
      const start = index;
      while (index < source.length && isWhitespace(source[index])) index += 1;
      push('whitespace', start, index);
      continue;
    }
    if (isParen(char)) {
      push('paren', index, index + 1);
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      const start = index;
      const quote = char;
      index += 1;
      while (index < source.length) {
        if (source[index] === '\\' && index + 1 < source.length) {
          index += 2;
          continue;
        }
        if (source[index] === quote) {
          index += 1;
          break;
        }
        index += 1;
      }
      push('value', start, index);
      continue;
    }
    if (char === '[' || char === '{') {
      const start = index;
      const close = char === '[' ? ']' : '}';
      index += 1;
      while (index < source.length && source[index] !== close) index += 1;
      if (index < source.length) index += 1;
      push('range', start, index);
      continue;
    }

    const start = index;
    while (
      index < source.length &&
      !isWhitespace(source[index]) &&
      !isParen(source[index]) &&
      source[index] !== '"' &&
      source[index] !== "'" &&
      source[index] !== '[' &&
      source[index] !== '{'
    ) {
      index += 1;
    }
    const word = source.slice(start, index);
    if (!word) {
      index += 1;
      continue;
    }

    const emitWord = (text: string, textStart: number, textEnd: number): void => {
      if (text === 'AND' || text === 'OR' || text === 'NOT') {
        push('keyword', textStart, textEnd);
        return;
      }
      const parts = splitFieldExpression(text);
      if (parts) {
        const opIndex = text.indexOf(parts.operator);
        const hasOperator = opIndex > 0;
        // `field:>=value` keeps the colon before the comparison operator;
        // the colon belongs to neither the field nor the operator token.
        const fieldEnd = hasOperator && text[opIndex - 1] === ':'
          ? textStart + opIndex - 1
          : textStart + Math.max(0, opIndex);
        push('field', textStart, fieldEnd);
        if (hasOperator) push('operator', textStart + opIndex, textStart + opIndex + parts.operator.length);
        const valueStart = hasOperator ? textStart + opIndex + parts.operator.length : textEnd;
        if (textEnd > valueStart) push('value', valueStart, textEnd);
        return;
      }
      if (/^(?:>=|<=|!=|=|:|~|>|<)$/.test(text)) {
        push('operator', textStart, textEnd);
        return;
      }
      push('value', textStart, textEnd);
    };

    // Attached negation: `-field:value` / `!field:value`.
    if (word.length > 1 && (word.startsWith('-') || word.startsWith('!')) && /[A-Za-z_(]/.test(word[1])) {
      push('value', start, start + 1);
      emitWord(word.slice(1), start + 1, index);
      continue;
    }
    emitWord(word, start, index);
  }

  return tokens;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && (trimmed.startsWith('"') || trimmed.startsWith("'"))) {
    const quote = trimmed[0];
    return trimmed.slice(1, -1).replace(new RegExp(`\\\\${quote}`, 'g'), quote);
  }
  return trimmed;
}

function spanFrom(tokens: QueryToken[], startIndex: number, endIndex: number): SourceSpan {
  const first = tokens[startIndex];
  const last = tokens[endIndex - 1];
  return {
    start: first?.span.start ?? 0,
    end: last?.span.end ?? first?.span.end ?? 0,
  };
}

/** Parse `source` into a validated AST. The parser never throws on user input. */
export function parseQuery(source: string): ParsedQuery {
  const tokens = tokenizeQuery(source);
  const meaningful = tokens.filter((token) => token.kind !== 'whitespace');
  const diagnostics: QueryDiagnostic[] = [];
  let position = 0;

  const report = (
    severity: DiagnosticSeverity,
    message: string,
    span: SourceSpan = { start: 0, end: source.length },
  ): void => {
    diagnostics.push({ severity, message, span });
  };

  const peek = (): QueryToken | undefined => meaningful[position];
  const consume = (): QueryToken | undefined => meaningful[position++];

  function parsePrimary(): QueryNode {
    const token = peek();
    if (!token) {
      return { kind: 'match_all', span: { start: source.length, end: source.length } };
    }

    if (token.kind === 'paren' && token.value === '(') {
      consume();
      const inner = parseOr();
      const closing = peek();
      if (closing?.kind === 'paren' && closing.value === ')') {
        const end = closing.span.end;
        consume();
        return { ...inner, span: { start: token.span.start, end } };
      }
      report('error', 'Unclosed parenthesis: expected ")".', token.span);
      return inner;
    }

    if (token.kind === 'paren' && token.value === ')') {
      consume();
      report('error', 'Unexpected ")".', token.span);
      return { kind: 'match_all', span: token.span };
    }

    if (token.kind === 'keyword') {
      consume();
      report('error', `Unexpected keyword "${token.value}".`, token.span);
      return { kind: 'match_all', span: token.span };
    }

    if (token.value === ':' || token.value === '=' || token.value === '>' || token.value === '<' || token.value === '~' || token.value === '!=' || token.value === '>=' || token.value === '<=') {
      consume();
      report('error', `Operator "${token.value}" is missing a field name.`, token.span);
      return { kind: 'match_all', span: token.span };
    }

    // A range may appear on its own (treated as a timestamp range).
    if (token.kind === 'range') {
      consume();
      return parseRange('timestamp', token, token.span);
    }

    // `field` token followed by an operator then value tokens.
    if (token.kind === 'field') {
      const fieldToken = consume() as QueryToken;
      const operatorToken = peek();
      if (!operatorToken || operatorToken.kind !== 'operator') {
        report('warning', `Field "${fieldToken.value}" has no operator; assuming ":".`, fieldToken.span);
        return {
          kind: 'term', field: fieldToken.value, operator: ':', value: '', negated: false,
          span: fieldToken.span,
        };
      }
      consume();
      const operator = operatorToken.value as FieldOperator;

      if (operator === '!=' && peek()?.kind === 'range') {
        const rangeToken = consume() as QueryToken;
        return parseRange(fieldToken.value, rangeToken, { start: fieldToken.span.start, end: rangeToken.span.end }, true);
      }

      if (operator === ':') {
        const next = peek();
        if (next?.kind === 'range') {
          consume();
          return parseRange(fieldToken.value, next, { start: fieldToken.span.start, end: next.span.end });
        }
      }

      const valueTokens: QueryToken[] = [];
      let candidate = peek();
      while (candidate && candidate.kind !== 'keyword' && candidate.kind !== 'paren' && candidate.kind !== 'field') {
        // Whitespace tokens are filtered out, so a positional gap means the
        // next token belongs to a new clause (implicit AND), not this value.
        if (valueTokens.length > 0 && candidate.span.start > valueTokens[valueTokens.length - 1].span.end) break;
        valueTokens.push(consume() as QueryToken);
        candidate = peek();
      }
      if (valueTokens.length === 0) {
        report('error', `Field "${fieldToken.value}" requires a value.`, operatorToken.span);
      }
      const rawValue = valueTokens.map((item) => item.value).join('').trim();
      if (!knownField(fieldToken.value)) {
        report('warning', `Field "${fieldToken.value}" is not a standard facet; attribute fields are still searchable.`, fieldToken.span);
      }
      return {
        kind: 'term',
        field: fieldToken.value,
        operator,
        value: unquote(rawValue),
        negated: false,
        span: { start: fieldToken.span.start, end: valueTokens[valueTokens.length - 1]?.span.end ?? operatorToken.span.end },
      };
    }

    // Bare value: free text search. Adjoin quoted fragments into one phrase.
    const parts: QueryToken[] = [];
    let textToken = peek();
    while (textToken && (textToken.kind === 'value' || textToken.kind === 'range')) {
      parts.push(consume() as QueryToken);
      textToken = peek();
    }
    const value = unquote(parts.map((part) => part.value).join(''));
    if (!value) {
      report('error', 'Expected a search term.', token.span);
      return { kind: 'match_all', span: token.span };
    }
    return {
      kind: 'term', field: null, operator: ':', value, negated: false,
      span: spanFrom(meaningful, Math.max(0, position - parts.length), position),
    };
  }

  function parseRange(
    field: string,
    token: QueryToken,
    span: SourceSpan,
    negated = false,
  ): QueryNode {
    const raw = token.value.slice(1, -1);
    const match = /^\s*(.*?)\s+TO\s+(.*?)\s*$/.exec(raw);
    if (!match) {
      report('error', 'Range must use "from TO to" (for example `[2026-01-01 TO 2026-02-01]`).', token.span);
      return { kind: 'range', field, from: raw.trim(), to: '', includeFrom: true, includeTo: true, negated, span };
    }
    return {
      kind: 'range',
      field,
      from: unquote(match[1]),
      to: unquote(match[2]),
      includeFrom: token.value.startsWith('['),
      includeTo: token.value.endsWith(']'),
      negated,
      span,
    };
  }

  function parseUnary(): QueryNode {
    const token = peek();
    if (token?.kind === 'keyword' && token.value === 'NOT') {
      consume();
      const child = parseUnary();
      return { kind: 'not', child, span: { start: token.span.start, end: child.span.end } };
    }
    if (token?.kind === 'value' && (token.value === '!' || token.value === '-') && token.span.end - token.span.start === 1) {
      consume();
      const child = parseUnary();
      return { kind: 'not', child, span: { start: token.span.start, end: child.span.end } };
    }
    return parsePrimary();
  }

  function parseAnd(): QueryNode {
    const children: QueryNode[] = [parseUnary()];
    while (position < meaningful.length) {
      const token = peek() as QueryToken;
      if (token.kind === 'keyword' && token.value === 'AND') {
        consume();
        if (position >= meaningful.length) {
          report('error', 'Trailing AND.', token.span);
          break;
        }
        children.push(parseUnary());
        continue;
      }
      if (token.kind === 'keyword' || (token.kind === 'paren' && token.value === ')')) break;
      // Implicit AND: `level:error source:rpc`.
      children.push(parseUnary());
    }
    return children.length === 1
      ? children[0]
      : { kind: 'and', children, span: spanFrom(meaningful, 0, position) };
  }

  function parseOr(): QueryNode {
    const children: QueryNode[] = [parseAnd()];
    while (peek()?.kind === 'keyword' && (peek() as QueryToken).value === 'OR') {
      const token = consume() as QueryToken;
      if (position >= meaningful.length) {
        report('error', 'Trailing OR.', token.span);
        break;
      }
      children.push(parseAnd());
    }
    return children.length === 1
      ? children[0]
      : { kind: 'or', children, span: spanFrom(meaningful, 0, position) };
  }

  const ast = source.trim().length === 0
    ? { kind: 'match_all' as const, span: { start: 0, end: 0 } }
    : parseOr();

  if (position < meaningful.length) {
    const token = meaningful[position];
    report('error', `Unexpected token "${token.value}".`, token.span);
  }

  return {
    source,
    tokens,
    ast,
    diagnostics,
    valid: diagnostics.every((item) => item.severity !== 'error'),
  };
}

/** Examples surfaced in the query bar's help popover. */
export const QUERY_EXAMPLES: { label: string; query: string }[] = [
  { label: 'Errors in the last campaign', query: 'level:error AND campaign_id:camp-*' },
  { label: 'A fuzz worker failure', query: 'source:fuzz-worker AND (error_code:INV-* OR message:panic)' },
  { label: 'Slow RPC calls', query: 'source:rpc AND latency:>=800' },
  { label: 'One trace across services', query: 'trace_id:tr-1042' },
  { label: 'Exclude known flake', query: 'level:error AND NOT message:"transient timeout"' },
];
