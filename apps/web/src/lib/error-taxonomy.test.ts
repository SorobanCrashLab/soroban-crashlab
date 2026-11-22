import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from './error-codes';
import {
  ERROR_CLASSES,
  buildErrorPresentation,
  classifyError,
  classifyErrorCode,
  classifyHttpStatus,
  type ErrorClass,
} from './error-taxonomy';

describe('error taxonomy', () => {
  describe('classifyHttpStatus', () => {
    it('maps the recovery-relevant statuses to their class', () => {
      expect(classifyHttpStatus(400)).toBe('config');
      expect(classifyHttpStatus(422)).toBe('config');
      expect(classifyHttpStatus(409)).toBe('config');
      expect(classifyHttpStatus(413)).toBe('config');
      expect(classifyHttpStatus(404)).toBe('notfound');
      expect(classifyHttpStatus(410)).toBe('notfound');
      expect(classifyHttpStatus(401)).toBe('permission');
      expect(classifyHttpStatus(403)).toBe('permission');
      expect(classifyHttpStatus(429)).toBe('transient');
      expect(classifyHttpStatus(503)).toBe('transient');
      expect(classifyHttpStatus(500)).toBe('internal');
      expect(classifyHttpStatus(502)).toBe('transient');
    });

    it('defaults an unknown 4xx to config and anything else to internal', () => {
      expect(classifyHttpStatus(418)).toBe('config');
      expect(classifyHttpStatus(200)).toBe('internal');
      expect(classifyHttpStatus(0)).toBe('internal');
    });
  });

  describe('classifyErrorCode', () => {
    it('returns null for a missing code', () => {
      expect(classifyErrorCode(undefined)).toBeNull();
      expect(classifyErrorCode('')).toBeNull();
      expect(classifyErrorCode(null)).toBeNull();
    });

    it('classifies every catalogued code into one of the five classes', () => {
      for (const entry of Object.values(ERROR_CODES)) {
        const errorClass = classifyErrorCode(entry.code);
        expect(ERROR_CLASSES).toContain(errorClass);
        // Catalog status and code classification must not disagree.
        expect(errorClass).toBe(classifyHttpStatus(entry.httpStatus));
      }
    });

    it('classifies codes minted after this module via suffix heuristics', () => {
      expect(classifyErrorCode('SIGNATURE_NOT_FOUND')).toBe('notfound');
      expect(classifyErrorCode('TRIAGE_FORBIDDEN')).toBe('permission');
      expect(classifyErrorCode('TRIAGE_STATUS_INVALID')).toBe('config');
      expect(classifyErrorCode('QUEUE_RATE_LIMITED')).toBe('transient');
      expect(classifyErrorCode('REPLAY_INTERNAL_ERROR')).toBe('internal');
      expect(classifyErrorCode('WHAT_IS_THIS')).toBeNull();
    });
  });

  describe('classifyError', () => {
    it('prefers the machine code over the status', () => {
      expect(classifyError({ status: 500, code: 'NOT_FOUND' })).toBe('notfound');
      expect(classifyError({ status: 404, code: 'INTERNAL_ERROR' })).toBe('internal');
    });

    it('treats an unreachable server as transient regardless of status', () => {
      expect(classifyError({ offline: true })).toBe('transient');
      expect(classifyError({ offline: true, status: 500 })).toBe('transient');
    });

    it('falls back to internal when nothing is known', () => {
      expect(classifyError({})).toBe('internal');
      expect(classifyError({ code: 'MYSTERY_CODE' })).toBe('internal');
    });
  });

  describe('buildErrorPresentation', () => {
    it('gives config failures a settings path and no retry button', () => {
      const presentation = buildErrorPresentation({ status: 422 });
      expect(presentation.errorClass).toBe('config');
      expect(presentation.retryable).toBe(false);
      expect(presentation.actions.map((action) => action.id)).not.toContain('retry');
      expect(presentation.actions.map((action) => action.id)).toContain('fix-config');
      expect(presentation.showReportProblem).toBe(false);
      expect(presentation.showRequestId).toBe(false);
    });

    it('gives not-found failures guided navigation first', () => {
      const presentation = buildErrorPresentation({ code: 'RUN_NOT_FOUND', status: 404 });
      expect(presentation.errorClass).toBe('notfound');
      expect(presentation.actions[0]?.id).toBe('browse');
      expect(presentation.actions[0]?.href).toBe('/runs');
    });

    it('separates re-auth (401) from requesting capability (403)', () => {
      const unauthenticated = buildErrorPresentation({ status: 401 });
      expect(unauthenticated.errorClass).toBe('permission');
      expect(unauthenticated.actions.map((action) => action.id)).toContain('reauth');

      const forbidden = buildErrorPresentation({ status: 403, code: 'FORBIDDEN' });
      expect(forbidden.actions.map((action) => action.id)).toContain('request-access');
      // Retrying a permission failure with the same credentials is pointless.
      expect(forbidden.retryable).toBe(false);
    });

    it('offers retry and a request id for transient failures', () => {
      const presentation = buildErrorPresentation({ status: 503, requestId: 'req-42' });
      expect(presentation.errorClass).toBe('transient');
      expect(presentation.retryable).toBe(true);
      expect(presentation.showRequestId).toBe(true);
      expect(presentation.actions[0]?.id).toBe('retry');
    });

    it('always offers report-a-problem for internal failures', () => {
      const presentation = buildErrorPresentation({ status: 500, requestId: 'req-9' });
      expect(presentation.errorClass).toBe('internal');
      expect(presentation.showReportProblem).toBe(true);
      expect(presentation.showRequestId).toBe(true);
      expect(presentation.actions.map((action) => action.id)).toContain('report');
    });

    it('hides retry when the failing request was not an idempotent read', () => {
      const presentation = buildErrorPresentation({
        status: 503,
        idempotentRead: false,
      });
      expect(presentation.errorClass).toBe('transient');
      expect(presentation.retryable).toBe(false);
      expect(presentation.actions.map((action) => action.id)).not.toContain('retry');
      // The user still gets the honest "check the service" path.
      expect(presentation.actions.map((action) => action.id)).toContain('open-health');
    });

    it('explains an offline failure in the user’s terms', () => {
      const presentation = buildErrorPresentation({ offline: true });
      expect(presentation.errorClass).toBe('transient');
      expect(presentation.cause).toMatch(/could not reach the server/i);
    });

    it('produces a valid class for every class in the taxonomy', () => {
      const statusForClass: Array<{ status: number; expected: ErrorClass }> = [
        { status: 400, expected: 'config' },
        { status: 404, expected: 'notfound' },
        { status: 403, expected: 'permission' },
        { status: 503, expected: 'transient' },
        { status: 500, expected: 'internal' },
      ];
      for (const { status, expected } of statusForClass) {
        const presentation = buildErrorPresentation({ status });
        expect(presentation.errorClass).toBe(expected);
        expect(presentation.title.length).toBeGreaterThan(0);
        expect(presentation.cause.length).toBeGreaterThan(0);
        expect(presentation.actions.length).toBeGreaterThan(0);
      }
    });
  });
});
