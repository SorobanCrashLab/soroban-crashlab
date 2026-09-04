/**
 * Machine-readable error code catalog.
 *
 * Each entry is a triplet of:
 *   code        — stable string clients can switch on (never renamed after release)
 *   message     — default human-readable description (may be overridden at call-site)
 *   httpStatus  — the HTTP status code this error class maps to
 *
 * Rules:
 *   - Codes are SCREAMING_SNAKE_CASE, globally unique, never deleted.
 *   - Add new entries at the bottom of the relevant section.
 *   - httpStatus must be in the 4xx–5xx range.
 *
 * Issue #1387: establishes the catalog; three routes migrate as exemplars.
 * Fleet-wide rollout is follow-up work.
 *
 * Naming convention (proposed for maintainer ratification in PR):
 *   <RESOURCE>_<CONDITION>
 *   e.g. RUN_NOT_FOUND, WEBHOOK_DELIVERY_NOT_FOUND, ARTIFACT_INVALID_BUNDLE
 */

export interface ErrorCatalogEntry {
  readonly code: string;
  readonly message: string;
  readonly httpStatus: number;
}

/**
 * Frozen catalog — iterate with Object.values(ERROR_CODES).
 * The `as const` + `satisfies` combo keeps each entry fully typed while
 * preventing accidental mutation at runtime.
 */
export const ERROR_CODES = Object.freeze({
  // -------------------------------------------------------------------------
  // Generic / cross-cutting
  // -------------------------------------------------------------------------
  INTERNAL_ERROR: {
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred.',
    httpStatus: 500,
  },
  VALIDATION_ERROR: {
    code: 'VALIDATION_ERROR',
    message: 'Request validation failed.',
    httpStatus: 400,
  },
  NOT_FOUND: {
    code: 'NOT_FOUND',
    message: 'The requested resource was not found.',
    httpStatus: 404,
  },
  UNAUTHORIZED: {
    code: 'UNAUTHORIZED',
    message: 'Authentication is required.',
    httpStatus: 401,
  },
  FORBIDDEN: {
    code: 'FORBIDDEN',
    message: 'You do not have permission to perform this action.',
    httpStatus: 403,
  },

  // -------------------------------------------------------------------------
  // Runs
  // -------------------------------------------------------------------------
  RUN_NOT_FOUND: {
    code: 'RUN_NOT_FOUND',
    message: 'Run not found.',
    httpStatus: 404,
  },
  RUN_ID_REQUIRED: {
    code: 'RUN_ID_REQUIRED',
    message: 'Run ID is required.',
    httpStatus: 400,
  },
  RUN_UPSTREAM_ERROR: {
    code: 'RUN_UPSTREAM_ERROR',
    message: 'Upstream error fetching run.',
    httpStatus: 502,
  },

  // -------------------------------------------------------------------------
  // Webhook delivery
  // -------------------------------------------------------------------------
  WEBHOOK_DELIVERY_NOT_FOUND: {
    code: 'WEBHOOK_DELIVERY_NOT_FOUND',
    message: 'Webhook delivery record not found.',
    httpStatus: 404,
  },
  WEBHOOK_DELIVERY_ID_REQUIRED: {
    code: 'WEBHOOK_DELIVERY_ID_REQUIRED',
    message: 'Field "id" is required.',
    httpStatus: 400,
  },

  // -------------------------------------------------------------------------
  // Artifact validation
  // -------------------------------------------------------------------------
  ARTIFACT_INVALID_BUNDLE: {
    code: 'ARTIFACT_INVALID_BUNDLE',
    message: 'The submitted artifact bundle failed validation.',
    httpStatus: 422,
  },
  ARTIFACT_MISSING_BUNDLE_FIELD: {
    code: 'ARTIFACT_MISSING_BUNDLE_FIELD',
    message: 'Missing "bundle" field in request body.',
    httpStatus: 400,
  },
  ARTIFACT_PAYLOAD_TOO_LARGE: {
    code: 'ARTIFACT_PAYLOAD_TOO_LARGE',
    message: 'Request body exceeds the allowed size limit.',
    httpStatus: 413,
  },
  ARTIFACT_INVALID_JSON: {
    code: 'ARTIFACT_INVALID_JSON',
    message: 'Invalid JSON in request body.',
    httpStatus: 400,
  },
} as const) satisfies Record<string, ErrorCatalogEntry>;

export type ErrorCode = keyof typeof ERROR_CODES;

/**
 * Returns a NextResponse with the standard error envelope, including the
 * machine-readable `code` field alongside the human-readable `error` message.
 *
 * The `message` parameter is optional — when omitted the catalog default is used.
 *
 * Shape emitted:
 *   { error: string, code: string }
 *
 * This is an additive field on the existing `{ error: string }` envelope and
 * is non-breaking for clients that only read `error`.
 */
import { NextResponse } from 'next/server';

export interface CodedErrorEnvelope {
  error: string;
  code: string;
}

export function codedErrorResponse(
  errorCode: ErrorCode,
  message?: string,
): NextResponse<CodedErrorEnvelope> {
  const entry = ERROR_CODES[errorCode];
  return NextResponse.json(
    {
      error: message ?? entry.message,
      code: entry.code,
    } satisfies CodedErrorEnvelope,
    { status: entry.httpStatus },
  );
}
