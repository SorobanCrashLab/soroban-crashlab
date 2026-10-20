import { NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';

/**
 * Central CSRF defense for mutating API routes.
 *
 * Two layers of protection:
 *  1. Header checks (Origin / Sec-Fetch-Site) for browser-session requests.
 *  2. Double-submit token flow for routes where header checks are insufficient.
 */

export type CsrfAuthClass = 'browser-session' | 'bearer-token' | 'public';

export interface CsrfOptions {
  /** How the route is authenticated. */
  authClass?: CsrfAuthClass;
  /** Require a valid double-submit token in addition to header checks. */
  requireDoubleSubmit?: boolean;
  /** Explicitly mark a bearer-authenticated route as non-browser (exempt from browser checks). */
  nonBrowser?: boolean;
  /** Override the expected origin (host). Defaults to the request host. */
  expectedHost?: string;
}

const CSRF_COOKIE_NAME = '_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_TOKEN_TTL = 60 * 60 * 1000; // 1 hour

const mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

CSRF_COOKIE_NAME;
CSRF_HEADER_NAME;
CSRF_TOKEN_TTL;
mutatingMethods;
