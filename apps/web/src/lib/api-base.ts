/**
 * Build-time API base URL.
 *
 * Single source of truth for the base URL the browser bundle talks to. Next.js
 * inlines `process.env.NEXT_PUBLIC_*` into client code at build time, so this
 * constant is substituted when the app is built, not when it runs:
 *
 *   NEXT_PUBLIC_API_URL=https://api.crashlab.io pnpm build
 *
 * When unset, `API_BASE` is an empty string and the client talks to the same
 * origin (the Next.js `/api/*` routes), which is the default/mock-data mode.
 *
 * Server-side routes must NOT import this constant: they intentionally read
 * `process.env.NEXT_PUBLIC_API_URL` at request time so runtime-configured
 * backends (and the tests that stub the env) keep working. This module is for
 * browser (build-time) consumers only.
 */

export const API_BASE: string = process.env.NEXT_PUBLIC_API_URL ?? '';
