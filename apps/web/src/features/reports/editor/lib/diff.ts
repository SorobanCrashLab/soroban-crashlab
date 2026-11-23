/** Line-oriented diff used by version history comparison. */
import { normalizeNewlines } from './serialization';

export interface DiffLine {
  type: 'context' | 'add' | 'remove';
  text: string;
  leftLine?: number;
  rightLine?: number;
}

const MAX_LCS_CELLS = 2_000_000;

/**
 * Deterministic LCS diff. Very large documents fall back to a prefix/suffix
 * trim plus a single replace hunk, keeping comparison bounded for 10k+ word
 * reports instead of allocating a quadratic matrix.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const left = normalizeNewlines(before).split('\n');
  const right = normalizeNewlines(after).split('\n');

  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < left.length - prefix &&
    suffix < right.length - prefix &&
    left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const head: DiffLine[] = [];
  for (let index = 0; index < prefix; index += 1) {
    head.push({ type: 'context', text: left[index], leftLine: index + 1, rightLine: index + 1 });
  }

  const leftMiddle = left.slice(prefix, left.length - suffix);
  const rightMiddle = right.slice(prefix, right.length - suffix);
  const middle: DiffLine[] =
    leftMiddle.length * rightMiddle.length <= MAX_LCS_CELLS
      ? lcsDiff(leftMiddle, rightMiddle, prefix)
      : [
          ...leftMiddle.map((text, index) => ({
            type: 'remove' as const,
            text,
            leftLine: prefix + index + 1,
          })),
          ...rightMiddle.map((text, index) => ({
            type: 'add' as const,
            text,
            rightLine: prefix + index + 1,
          })),
        ];

  const tail: DiffLine[] = [];
  for (let index = 0; index < suffix; index += 1) {
    const leftLine = left.length - suffix + index;
    const rightLine = right.length - suffix + index;
    tail.push({
      type: 'context',
      text: right[rightLine],
      leftLine: leftLine + 1,
      rightLine: rightLine + 1,
    });
  }

  return [...head, ...middle, ...tail];
}

function lcsDiff(left: string[], right: string[], offset: number): DiffLine[] {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const table = new Uint32Array(rows * columns);
  const at = (row: number, column: number) => table[row * columns + column];

  for (let row = left.length - 1; row >= 0; row -= 1) {
    for (let column = right.length - 1; column >= 0; column -= 1) {
      table[row * columns + column] =
        left[row] === right[column]
          ? at(row + 1, column + 1) + 1
          : Math.max(at(row + 1, column), at(row, column + 1));
    }
  }

  const result: DiffLine[] = [];
  let row = 0;
  let column = 0;
  while (row < left.length && column < right.length) {
    if (left[row] === right[column]) {
      result.push({
        type: 'context',
        text: left[row],
        leftLine: offset + row + 1,
        rightLine: offset + column + 1,
      });
      row += 1;
      column += 1;
    } else if (at(row + 1, column) >= at(row, column + 1)) {
      result.push({ type: 'remove', text: left[row], leftLine: offset + row + 1 });
      row += 1;
    } else {
      result.push({ type: 'add', text: right[column], rightLine: offset + column + 1 });
      column += 1;
    }
  }
  while (row < left.length) {
    result.push({ type: 'remove', text: left[row], leftLine: offset + row + 1 });
    row += 1;
  }
  while (column < right.length) {
    result.push({ type: 'add', text: right[column], rightLine: offset + column + 1 });
    column += 1;
  }
  return result;
}
