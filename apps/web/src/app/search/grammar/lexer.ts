/**
 * Lexer for the structured search grammar (#1432).
 *
 * Every token carries its source span so the parser can point a caret at the
 * exact character that went wrong, rather than failing the whole query with a
 * silent zero-result.
 */

export type TokenType =
  | 'word'
  | 'phrase'
  | 'colon'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'lparen'
  | 'rparen'
  | 'minus'
  | 'or'
  | 'eof';

export interface Token {
  type: TokenType;
  /** Literal text for words; the unquoted contents for phrases. */
  value: string;
  start: number;
  end: number;
}

export class QueryError extends Error {
  readonly position: number;
  readonly expected: string[];

  constructor(message: string, position: number, expected: string[] = []) {
    super(message);
    this.name = 'QueryError';
    this.position = position;
    this.expected = expected;
  }
}

/** Characters that end a bare word. */
const DELIMITERS = new Set([' ', '\t', '\n', ':', '>', '<', '(', ')', '"']);

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  const push = (type: TokenType, value: string, start: number, end: number) => {
    tokens.push({ type, value, start, end });
  };

  while (index < input.length) {
    const char = input[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === '(') {
      push('lparen', '(', index, index + 1);
      index += 1;
      continue;
    }
    if (char === ')') {
      push('rparen', ')', index, index + 1);
      index += 1;
      continue;
    }
    if (char === ':') {
      push('colon', ':', index, index + 1);
      index += 1;
      continue;
    }
    if (char === '>' || char === '<') {
      const hasEquals = input[index + 1] === '=';
      const type: TokenType = char === '>' ? (hasEquals ? 'gte' : 'gt') : hasEquals ? 'lte' : 'lt';
      const width = hasEquals ? 2 : 1;
      push(type, input.slice(index, index + width), index, index + width);
      index += width;
      continue;
    }

    // A `-` only negates at the start of a term; inside a word (or a date like
    // 2026-08-01) it is an ordinary character.
    if (char === '-' && startsTerm(input, index)) {
      push('minus', '-', index, index + 1);
      index += 1;
      continue;
    }

    if (char === '"') {
      const closing = input.indexOf('"', index + 1);
      if (closing === -1) {
        throw new QueryError('Unterminated quoted phrase.', index, ['closing "']);
      }
      push('phrase', input.slice(index + 1, closing), index, closing + 1);
      index = closing + 1;
      continue;
    }

    const start = index;
    while (index < input.length && !DELIMITERS.has(input[index])) {
      index += 1;
    }
    const value = input.slice(start, index);
    if (value.length === 0) {
      throw new QueryError(`Unexpected character ${JSON.stringify(char)}.`, start);
    }
    push(value === 'OR' ? 'or' : 'word', value, start, index);
  }

  push('eof', '', input.length, input.length);
  return tokens;
}

/**
 * True when a `-` begins a term rather than sitting inside one. Anchoring on
 * the source character before it keeps `2026-08-01` and `foo-bar` intact.
 */
function startsTerm(input: string, index: number): boolean {
  if (index === 0) return true;
  const previous = input[index - 1];
  return /\s/.test(previous) || previous === '(';
}

/** Renders a caret line under the offending character for error display. */
export function caretLine(input: string, position: number): string {
  return `${input}\n${' '.repeat(Math.max(0, position))}^`;
}
