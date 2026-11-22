/**
 * Recursive-descent parser for the search grammar (#1432).
 *
 * query   = orExpr
 * orExpr  = andExpr { "OR" andExpr }
 * andExpr = unary { unary }            (* implicit AND *)
 * unary   = [ "-" ] primary
 * primary = "(" orExpr ")" | term
 * term    = field ( ":" | ">" | ">=" | "<" | "<=" ) value | phrase | word
 */

import { QueryError, tokenize, type Token } from './lexer';

export type ComparisonOperator = ':' | '>' | '>=' | '<' | '<=';

export type QueryNode =
  | { type: 'and'; children: QueryNode[] }
  | { type: 'or'; children: QueryNode[] }
  | { type: 'not'; child: QueryNode }
  | { type: 'field'; field: string; operator: ComparisonOperator; value: string; position: number }
  | { type: 'text'; value: string; position: number };

const OPERATOR_TOKENS: Record<string, ComparisonOperator> = {
  colon: ':',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
};

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.index];
  }

  private next(): Token {
    return this.tokens[this.index++];
  }

  parse(): QueryNode {
    const node = this.parseOr();
    const token = this.peek();
    if (token.type !== 'eof') {
      throw new QueryError(
        `Unexpected ${describe(token)}.`,
        token.start,
        ['end of query', 'OR', 'a search term'],
      );
    }
    return node;
  }

  private parseOr(): QueryNode {
    const children = [this.parseAnd()];
    while (this.peek().type === 'or') {
      this.next();
      children.push(this.parseAnd());
    }
    return children.length === 1 ? children[0] : { type: 'or', children };
  }

  private parseAnd(): QueryNode {
    const children = [this.parseUnary()];
    while (startsPrimary(this.peek())) {
      children.push(this.parseUnary());
    }
    return children.length === 1 ? children[0] : { type: 'and', children };
  }

  private parseUnary(): QueryNode {
    if (this.peek().type === 'minus') {
      this.next();
      return { type: 'not', child: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): QueryNode {
    const token = this.peek();

    if (token.type === 'lparen') {
      this.next();
      const inner = this.parseOr();
      const closing = this.peek();
      if (closing.type !== 'rparen') {
        throw new QueryError('Unclosed group.', closing.start, [')']);
      }
      this.next();
      return inner;
    }

    if (token.type === 'phrase') {
      this.next();
      return { type: 'text', value: token.value, position: token.start };
    }

    if (token.type === 'word') {
      this.next();
      const operatorToken = this.peek();
      const operator = OPERATOR_TOKENS[operatorToken.type];

      if (!operator) {
        return { type: 'text', value: token.value, position: token.start };
      }

      this.next();
      const valueToken = this.peek();
      if (valueToken.type !== 'word' && valueToken.type !== 'phrase') {
        throw new QueryError(
          `Expected a value after "${token.value}${operatorToken.value}".`,
          valueToken.start,
          ['a value', 'a quoted phrase'],
        );
      }
      this.next();

      return {
        type: 'field',
        field: token.value,
        operator,
        value: valueToken.value,
        position: token.start,
      };
    }

    throw new QueryError(`Expected a search term but found ${describe(token)}.`, token.start, [
      'a search term',
      'a quoted phrase',
      '(',
    ]);
  }
}

function startsPrimary(token: Token): boolean {
  return (
    token.type === 'word' ||
    token.type === 'phrase' ||
    token.type === 'lparen' ||
    token.type === 'minus'
  );
}

function describe(token: Token): string {
  if (token.type === 'eof') return 'the end of the query';
  return `"${token.value}"`;
}

export function parseQuery(input: string): QueryNode {
  return new Parser(tokenize(input)).parse();
}

export { QueryError };
