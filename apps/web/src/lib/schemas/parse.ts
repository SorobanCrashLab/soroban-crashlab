/**
 * Shared helper: parse an object with a Zod schema and map failures to the
 * standard API error envelope `{ error: string, fieldErrors?: Record<string, string[]> }`.
 *
 * Issue #1384: single error-mapping helper used by all route handlers.
 */

import { z } from 'zod';
import { NextResponse } from 'next/server';

export interface FieldErrorEnvelope {
  error: string;
  fieldErrors: Record<string, string[]>;
}

/**
 * Parses `input` against `schema`. Returns `{ ok: true, data }` on success
 * or a ready-to-return 400 NextResponse with field-path errors on failure.
 */
export function zodParseRequest<T>(
  schema: z.ZodType<T>,
  input: unknown,
): { ok: true; data: T } | { ok: false; response: NextResponse } {
  const result = schema.safeParse(input);
  if (result.success) {
    return { ok: true, data: result.data };
  }

  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.length > 0 ? issue.path.join('.') : '_root';
    if (!fieldErrors[path]) fieldErrors[path] = [];
    fieldErrors[path].push(issue.message);
  }

  const body: FieldErrorEnvelope = {
    error: 'Request validation failed.',
    fieldErrors,
  };

  return {
    ok: false,
    response: NextResponse.json(body, { status: 400 }),
  };
}
