/**
 * Hand-rolled 5-field cron parser — no runtime dependencies (#1422).
 *
 * Grammar (whitespace-separated):
 *
 *   ┌───────────── minute        (0-59)
 *   │ ┌───────────── hour         (0-23)
 *   │ │ ┌───────────── day-of-month (1-31)
 *   │ │ │ ┌───────────── month       (1-12)
 *   │ │ │ │ ┌───────────── day-of-week (0-6, Sunday = 0; 7 also accepted as Sunday)
 *   * * * * *
 *
 * Each field is a comma-separated list of terms. A term is one of:
 *   *        every value in the field's range
 *   a        a single value
 *   a-b      an inclusive range (a <= b)
 *   * /n     every nth value across the whole range
 *   a-b/n    every nth value within a range
 *   a/n      every nth value from a up to the range maximum
 *
 * DST: the next-run calculator (see ./next-run) does all of its arithmetic in
 * UTC. v1 deliberately has NO wall-clock / DST semantics — a `0 9 * * *`
 * schedule fires at 09:00 UTC year-round, never 09:00 local.
 */

export interface CronFieldSpec {
  readonly name: string;
  readonly min: number;
  readonly max: number;
}

export const CRON_FIELDS = {
  minute: { name: 'minute', min: 0, max: 59 },
  hour: { name: 'hour', min: 0, max: 23 },
  dayOfMonth: { name: 'day-of-month', min: 1, max: 31 },
  month: { name: 'month', min: 1, max: 12 },
  dayOfWeek: { name: 'day-of-week', min: 0, max: 6 },
} as const satisfies Record<string, CronFieldSpec>;

export interface CronExpression {
  /** The trimmed source expression. */
  readonly source: string;
  readonly minute: number[];
  readonly hour: number[];
  readonly dayOfMonth: number[];
  readonly month: number[];
  readonly dayOfWeek: number[];
  /** True when the day-of-month field is not `*` (i.e. it restricts which days match). */
  readonly dayOfMonthRestricted: boolean;
  /** True when the day-of-week field is not `*`. */
  readonly dayOfWeekRestricted: boolean;
}

export class CronParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CronParseError';
  }
}

function parseNumber(token: string, spec: CronFieldSpec, term: string): number {
  if (!/^\d+$/.test(token)) {
    throw new CronParseError(
      `The ${spec.name} value "${token}" in "${term}" is not a non-negative integer.`,
    );
  }
  const n = Number(token);
  if (n < spec.min || n > spec.max) {
    throw new CronParseError(
      `The ${spec.name} value ${n} in "${term}" is out of range (${spec.min}-${spec.max}).`,
    );
  }
  return n;
}

function parseTerm(term: string, spec: CronFieldSpec, out: Set<number>): void {
  const slashParts = term.split('/');
  if (slashParts.length > 2) {
    throw new CronParseError(`The ${spec.name} term "${term}" has more than one step ('/').`);
  }

  const rangePart = slashParts[0];
  let step = 1;
  if (slashParts.length === 2) {
    const stepPart = slashParts[1];
    if (!/^\d+$/.test(stepPart)) {
      throw new CronParseError(
        `The ${spec.name} step "${stepPart}" in "${term}" is not a positive integer.`,
      );
    }
    step = Number(stepPart);
    if (step === 0) {
      throw new CronParseError(`The ${spec.name} step in "${term}" must be 1 or greater.`);
    }
  }

  if (rangePart === '') {
    throw new CronParseError(`The ${spec.name} term "${term}" is missing a value before '/'.`);
  }

  let lo: number;
  let hi: number;

  if (rangePart === '*') {
    lo = spec.min;
    hi = spec.max;
  } else if (rangePart.includes('-')) {
    const bounds = rangePart.split('-');
    if (bounds.length !== 2 || bounds[0] === '' || bounds[1] === '') {
      throw new CronParseError(`The ${spec.name} range "${rangePart}" is malformed.`);
    }
    lo = parseNumber(bounds[0], spec, term);
    hi = parseNumber(bounds[1], spec, term);
    if (lo > hi) {
      throw new CronParseError(
        `The ${spec.name} range "${rangePart}" is inverted (${lo} > ${hi}).`,
      );
    }
  } else {
    const value = parseNumber(rangePart, spec, term);
    lo = value;
    // "a/n" runs from a to the field maximum; a bare "a" is just that value.
    hi = slashParts.length === 2 ? spec.max : value;
  }

  for (let v = lo; v <= hi; v += step) {
    out.add(v);
  }
}

function parseField(
  raw: string,
  spec: CronFieldSpec,
): { values: number[]; restricted: boolean } {
  const trimmed = raw.trim();
  if (trimmed === '') {
    throw new CronParseError(`The ${spec.name} field is empty.`);
  }

  const restricted = trimmed !== '*';
  const set = new Set<number>();
  for (const rawTerm of trimmed.split(',')) {
    const term = rawTerm.trim();
    if (term === '') {
      throw new CronParseError(`The ${spec.name} field "${raw}" has an empty list item.`);
    }
    parseTerm(term, spec, set);
  }

  return { values: [...set].sort((a, b) => a - b), restricted };
}

const FIELD_ORDER = 'minute hour day-of-month month day-of-week';

/**
 * Parses a 5-field cron expression into sorted, de-duplicated value lists.
 *
 * @throws {CronParseError} with a precise, field-scoped message on any invalid input.
 */
export function parseCron(source: string): CronExpression {
  if (typeof source !== 'string') {
    throw new CronParseError('A cron expression must be a string.');
  }

  const trimmed = source.trim();
  if (trimmed === '') {
    throw new CronParseError('A cron expression must not be empty.');
  }

  const fields = trimmed.split(/\s+/);
  if (fields.length !== 5) {
    throw new CronParseError(
      `A cron expression must have exactly 5 fields (${FIELD_ORDER}); got ${fields.length}.`,
    );
  }

  const minute = parseField(fields[0], CRON_FIELDS.minute);
  const hour = parseField(fields[1], CRON_FIELDS.hour);
  const dayOfMonth = parseField(fields[2], CRON_FIELDS.dayOfMonth);
  const month = parseField(fields[3], CRON_FIELDS.month);
  // Day-of-week accepts 7 as an alias for Sunday (0); parse with an extended
  // ceiling, then fold 7 back to 0.
  const dayOfWeekRaw = parseField(fields[4], { name: 'day-of-week', min: 0, max: 7 });
  const dayOfWeek = [
    ...new Set(dayOfWeekRaw.values.map((v) => (v === 7 ? 0 : v))),
  ].sort((a, b) => a - b);

  return {
    source: trimmed,
    minute: minute.values,
    hour: hour.values,
    dayOfMonth: dayOfMonth.values,
    month: month.values,
    dayOfWeek,
    dayOfMonthRestricted: dayOfMonth.restricted,
    dayOfWeekRestricted: dayOfWeekRaw.restricted,
  };
}

/** Parses `source`, returning the error message instead of throwing (null when valid). */
export function cronErrorMessage(source: string): string | null {
  try {
    parseCron(source);
    return null;
  } catch (error) {
    return error instanceof CronParseError ? error.message : 'Invalid cron expression.';
  }
}
