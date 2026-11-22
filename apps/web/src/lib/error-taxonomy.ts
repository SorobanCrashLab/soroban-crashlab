/**
 * lib/error-taxonomy — the one place that decides *what kind* of failure a
 * user is looking at and what they can do about it (#1879).
 *
 * Every boundary, inline banner and API-error toast resolves its copy and its
 * recovery affordances through `buildErrorPresentation`, so a new route cannot
 * invent a fourth way of saying "access denied".
 *
 * The five classes are the contract with the UI:
 *
 *   config      — the request was wrong; the user can fix their input/settings
 *   notfound    — the thing is gone; the recovery is navigation
 *   permission  — auth/capability; the recovery is re-auth or a role request
 *   transient   — the system said "later"; retry is safe
 *   internal    — the system said "broken"; request id + report-a-problem
 *
 * Classification prefers the machine code from `error-codes.ts` (never renamed
 * after release) and falls back to the HTTP status when a code is missing.
 */

import { ERROR_CODES } from './error-codes';

export type ErrorClass = 'config' | 'notfound' | 'permission' | 'transient' | 'internal';

export type RecoveryActionId =
  | 'retry'
  | 'fix-config'
  | 'reauth'
  | 'request-access'
  | 'browse'
  | 'open-health'
  | 'report';

export interface RecoveryAction {
  id: RecoveryActionId;
  label: string;
  kind: 'retry' | 'link' | 'report';
  href?: string;
  /** Only rendered when the failing request was a safe/idempotent GET. */
  requiresIdempotentRead?: boolean;
}

export interface ErrorPresentationInput {
  /** HTTP status of the failing response, when there was one. */
  status?: number;
  /** Machine code from the error catalog, when the caller could recover one. */
  code?: string;
  /** The browser could not reach the server at all. */
  offline?: boolean;
  /** Correlation id returned by the API; shown for server-side failures. */
  requestId?: string;
  /** Route the failure happened on, used for the report payload. */
  route?: string;
  /** True when the failing request was a safe, idempotent GET. */
  idempotentRead?: boolean;
}

export interface ErrorPresentation {
  errorClass: ErrorClass;
  /** Short, plain-language headline. Never a stack frame or a raw code. */
  title: string;
  /** Plain-language cause: what went wrong, in the user's terms. */
  cause: string;
  /** Ordered recovery affordances; first entry is the primary button. */
  actions: RecoveryAction[];
  /** Whether offering a retry button is honest. */
  retryable: boolean;
  /** Whether to render the request id (server-side failures only). */
  showRequestId: boolean;
  /** Whether to offer "report a problem" with an attached event trail. */
  showReportProblem: boolean;
}

const CLASS_COPY: Record<ErrorClass, { title: string; cause: string }> = {
  config: {
    title: 'That request was rejected',
    cause: 'Something in the request or your settings needs fixing before this can run.',
  },
  notfound: {
    title: 'Nothing here',
    cause: 'The item you followed no longer exists — it may have been deleted or renamed.',
  },
  permission: {
    title: 'You do not have access',
    cause: 'This action needs a capability your account does not have yet.',
  },
  transient: {
    title: 'Temporarily unavailable',
    cause: 'The service is reachable but not answering right now. This usually clears on its own.',
  },
  internal: {
    title: 'Something broke on our side',
    cause: 'The server hit an unexpected error while handling this request.',
  },
};

const CLASS_ACTION_ORDER: Record<ErrorClass, RecoveryAction[]> = {
  config: [
    { id: 'fix-config', label: 'Review settings', kind: 'link', href: '/settings' },
    { id: 'browse', label: 'Back to runs', kind: 'link', href: '/runs' },
  ],
  notfound: [
    { id: 'browse', label: 'Browse runs', kind: 'link', href: '/runs' },
    { id: 'retry', label: 'Try again', kind: 'retry' },
  ],
  permission: [
    { id: 'reauth', label: 'Sign in again', kind: 'link', href: '/api/auth/github/login' },
    { id: 'request-access', label: 'Request access', kind: 'link', href: '/settings/roles' },
  ],
  transient: [
    { id: 'retry', label: 'Try again', kind: 'retry' },
    { id: 'open-health', label: 'Service status', kind: 'link', href: '/api/health' },
  ],
  internal: [
    { id: 'retry', label: 'Try again', kind: 'retry' },
    { id: 'report', label: 'Report a problem', kind: 'report' },
  ],
};

/** Statuses the user can actually resolve themselves. */
const CONFIG_STATUSES = new Set([400, 405, 409, 413, 415, 422]);
/** Statuses that mean "ask again later". */
const TRANSIENT_STATUSES = new Set([408, 425, 429, 502, 503, 504]);

/**
 * Status → class. Deliberately exhaustive over the 4xx/5xx ranges with an
 * explicit default, so a new status code classifies as `internal` (reportable)
 * rather than silently becoming something friendly.
 */
export function classifyHttpStatus(status: number): ErrorClass {
  if (status === 401 || status === 403) return 'permission';
  if (status === 404 || status === 410) return 'notfound';
  if (CONFIG_STATUSES.has(status)) return 'config';
  if (TRANSIENT_STATUSES.has(status)) return 'transient';
  if (status >= 500) return 'internal';
  if (status >= 400) return 'config';
  return 'internal';
}

/** `*_NOT_FOUND` etc. — suffix heuristics for codes added after this module. */
function classifyBySuffix(code: string): ErrorClass | null {
  if (/(_NOT_FOUND|_MISSING)$/.test(code)) return 'notfound';
  if (/(UNAUTHORIZED|FORBIDDEN)$/.test(code)) return 'permission';
  if (/(INVALID|REQUIRED|CONFLICT|REJECTED|NOT_ALLOWED|WINDOW_CLOSED)$/.test(code)) return 'config';
  if (/(TIMEOUT|UNAVAILABLE|RATE_LIMITED|QUOTA_EXCEEDED|TOO_LARGE)$/.test(code)) return 'transient';
  if (/(INTERNAL_ERROR|INTERNAL|UPSTREAM_ERROR|FAILED)$/.test(code)) return 'internal';
  return null;
}

/**
 * Machine code → class. The catalog's own `httpStatus` is authoritative when
 * the code is known; unknown codes fall back to suffix heuristics so a code
 * shipped before this module still classifies sensibly.
 */
export function classifyErrorCode(code: string | undefined | null): ErrorClass | null {
  if (!code) return null;
  const known = Object.values(ERROR_CODES).find((entry) => entry.code === code);
  if (known) return classifyHttpStatus(known.httpStatus);
  return classifyBySuffix(code);
}

/**
 * The class for a failure. Code first (it is the stable signal), then status,
 * then the honest default: an unexplained failure is an internal one.
 */
export function classifyError(input: {
  status?: number;
  code?: string;
  offline?: boolean;
}): ErrorClass {
  if (input.offline) return 'transient';
  const fromCode = classifyErrorCode(input.code);
  if (fromCode) return fromCode;
  if (typeof input.status === 'number') return classifyHttpStatus(input.status);
  return 'internal';
}

/** Every class is reportable only when a support bundle can say something useful. */
function shouldOfferReport(errorClass: ErrorClass, requestId?: string): boolean {
  if (errorClass === 'internal') return true;
  if (errorClass === 'transient') return true;
  // A 500 without a request id still deserves a report; a 400 does not.
  return Boolean(requestId);
}

/**
 * Builds the full presentation for one failure. Pure: no network, no storage,
 * no clock — callers supply everything the copy depends on.
 */
export function buildErrorPresentation(input: ErrorPresentationInput): ErrorPresentation {
  const errorClass = classifyError(input);
  const copy = CLASS_COPY[errorClass];
  const offlineCause = input.offline
    ? 'Your browser could not reach the server. Check your connection, then try again.'
    : copy.cause;

  const actions = CLASS_ACTION_ORDER[errorClass];

  const idempotent = input.idempotentRead !== false;
  const retryable = errorClass === 'transient' || errorClass === 'internal' || errorClass === 'notfound';

  return {
    errorClass,
    title: copy.title,
    cause: offlineCause,
    actions: actions.filter((action) => {
      if (action.id === 'retry') return retryable && idempotent;
      return true;
    }),
    retryable: retryable && idempotent,
    // A request id is only useful when the failure happened server-side; it
    // would just be noise on a 400 the user can fix themselves.
    showRequestId: Boolean(input.requestId) && (errorClass === 'internal' || errorClass === 'transient'),
    showReportProblem: shouldOfferReport(errorClass, input.requestId),
  };
}

/** The single, stable set of class ids — used by tests and by the docs sweep. */
export const ERROR_CLASSES: readonly ErrorClass[] = [
  'config',
  'notfound',
  'permission',
  'transient',
  'internal',
] as const;
