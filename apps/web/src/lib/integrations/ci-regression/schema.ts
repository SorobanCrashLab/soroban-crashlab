/**
 * Validation for `POST /api/integrations/ci/results` (#1890).
 *
 * Server-only (depends on zod); the CI script uses ./types directly. Every
 * field is bounded so a hostile or buggy poster cannot store unbounded data,
 * and a fixture's classification must agree with its outcome — the server
 * recomputes the delta counts from the fixtures rather than trusting totals.
 */

import { z } from 'zod';
import { CI_EVENTS, CI_RESULT_SCHEMA_VERSION, FIXTURE_CLASSIFICATIONS, type CiRegressionResult } from './types';

export const MAX_FIXTURES_PER_RESULT = 5_000;
export const MAX_ARTIFACTS_PER_RESULT = 50;

const httpsUrl = z
  .string()
  .max(2_048)
  .url()
  .refine((value) => value.startsWith('https://'), 'must be an https URL');

const shortText = z.string().min(1).max(200);

const fixtureSchema = z
  .object({
    id: shortText,
    seedId: z.number().int().nonnegative(),
    mode: shortText,
    expectedClass: shortText,
    actualClass: shortText.nullable(),
    outcome: z.enum(['pass', 'fail', 'error']),
    classification: z.enum(FIXTURE_CLASSIFICATIONS as [string, ...string[]]),
    baselineSignature: shortText.nullable(),
    error: z.string().max(2_000).nullable(),
  })
  .strict()
  .refine(
    (f) =>
      f.outcome === 'pass'
        ? f.classification === 'fixed' || f.classification === 'unchanged'
        : f.classification === 'new' || f.classification === 'recurring',
    { message: 'classification does not match outcome', path: ['classification'] },
  );

export const ciRegressionResultSchema = z
  .object({
    schemaVersion: z.literal(CI_RESULT_SCHEMA_VERSION),
    repository: z
      .string()
      .max(140)
      .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 'must be owner/repo')
      .refine((value) => value.split('/').every((part) => !/^\.+$/.test(part)), 'must be owner/repo'),
    commitSha: z.string().regex(/^[0-9a-f]{40}$/, 'must be a 40-character lowercase hex SHA'),
    prNumber: z.number().int().positive().nullable(),
    ref: z.string().max(255).nullable(),
    event: z.enum(CI_EVENTS as [string, ...string[]]),
    suiteRunId: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/, 'must be 1-64 of [A-Za-z0-9._-]'),
    runUrl: httpsUrl.nullable(),
    completedAt: z.string().datetime(),
    fixtures: z.array(fixtureSchema).max(MAX_FIXTURES_PER_RESULT),
    artifacts: z
      .array(z.object({ name: shortText, url: httpsUrl }).strict())
      .max(MAX_ARTIFACTS_PER_RESULT),
  })
  .strict()
  .refine((r) => new Set(r.fixtures.map((f) => f.id)).size === r.fixtures.length, {
    message: 'fixture ids must be unique',
    path: ['fixtures'],
  });

export type ParsedCiResult =
  | { ok: true; result: CiRegressionResult }
  | { ok: false; fieldErrors: Record<string, string[]> };

export function parseCiRegressionResult(input: unknown): ParsedCiResult {
  const parsed = ciRegressionResultSchema.safeParse(input);
  if (parsed.success) return { ok: true, result: parsed.data as CiRegressionResult };

  const fieldErrors: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_';
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { ok: false, fieldErrors };
}
