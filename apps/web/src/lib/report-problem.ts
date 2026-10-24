/**
 * lib/report-problem — payload builder for "report a problem" (#1879).
 *
 * A support request without a request id, a route and a recent event trail is
 * a guessing game, so every boundary that offers the button attaches the same
 * structured payload: where it happened, when, which class it was classified
 * as, and the last few events the client saw.
 *
 * W5-C10 redaction runs here rather than at the support channel: secrets never
 * leave the browser. The builder is pure (a caller supplies `now`) so the same
 * code is exercised by tests and by the boundary component.
 */

export interface ReportedEvent {
  at?: string;
  level?: 'info' | 'warn' | 'error';
  message: string;
}

export interface ReportProblemInput {
  /** Path the failure happened on, e.g. `/runs/run-42`. Query strings dropped. */
  route: string;
  requestId?: string;
  errorClass?: string;
  /** Short human summary of what the user saw. */
  summary?: string;
  /** Recent client-side event trail; capped and redacted before storage. */
  events?: readonly ReportedEvent[];
  now?: Date;
}

export interface ReportProblemPayload {
  schema: 1;
  route: string;
  requestId?: string;
  errorClass?: string;
  summary?: string;
  timestamp: string;
  events: ReportedEvent[];
  client: {
    /** Coarse viewport bucket — enough to reproduce layout bugs, no fingerprint. */
    viewport: 'mobile' | 'tablet' | 'desktop' | 'unknown';
    language?: string;
  };
}

export const MAX_REPORT_EVENTS = 20;
export const MAX_EVENT_LENGTH = 400;
export const MAX_SUMMARY_LENGTH = 400;
export const MAX_ROUTE_LENGTH = 200;

/**
 * Patterns that must never reach a support channel. Ordered so the most
 * specific wins; every one is case-insensitive where casing is irrelevant.
 */
const SECRET_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // Authorization headers, whatever scheme was used.
  { pattern: /\b(bearer|basic|token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, replacement: '$1 [redacted]' },
  // GitHub PATs and fine-grained tokens.
  { pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}\b/g, replacement: '[redacted-token]' },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{16,}\b/g, replacement: '[redacted-token]' },
  // Common API-key shapes.
  { pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g, replacement: '[redacted-key]' },
  { pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, replacement: '[redacted-key]' },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, replacement: '[redacted-key]' },
  // Inline credentials in URLs: scheme://user:pass@host
  { pattern: /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, replacement: '$1[redacted]@' },
  // key=value style secrets.
  {
    pattern: /\b(password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*[=:]\s*("[^"]*"|'[^']*'|[^\s,;&]+)/gi,
    replacement: '$1=[redacted]',
  },
  // Email addresses (PII).
  { pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: '[redacted-email]' },
];

/** Redacts secrets and PII from free text. Idempotent. */
export function redactReportText(text: string): string {
  let result = text;
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Redacts object values by key *and* by content, so a secret hidden under an
 * unexpected key still does not ship. Depth-bounded: report payloads are small.
 */
export function redactReportValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (typeof value === 'string') return redactReportText(value.slice(0, MAX_EVENT_LENGTH));
  if (Array.isArray(value)) return value.slice(0, MAX_REPORT_EVENTS).map((item) => redactReportValue(item, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY_PATTERN.test(key) ? '[redacted]' : redactReportValue(inner, depth + 1);
    }
    return out;
  }
  return value;
}

const SECRET_KEY_PATTERN =
  /^(password|passwd|secret|token|authorization|cookie|apikey|api_key|access_token|refresh_token|client_secret|private_key)$/i;

/** Keeps the path, drops the query/fragment — query strings carry tokens. */
export function normaliseRoute(route: string): string {
  const withoutQuery = route.split(/[?#]/)[0] ?? route;
  const trimmed = withoutQuery.trim();
  if (trimmed.length <= MAX_ROUTE_LENGTH) return trimmed || '/';
  return `${trimmed.slice(0, MAX_ROUTE_LENGTH - 1)}…`;
}

export function classifyViewport(width: number): ReportProblemPayload['client']['viewport'] {
  if (!Number.isFinite(width) || width <= 0) return 'unknown';
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

function clamp(text: string | undefined, max: number): string | undefined {
  if (!text) return undefined;
  const redacted = redactReportText(text).trim();
  if (!redacted) return undefined;
  return redacted.length > max ? `${redacted.slice(0, max - 1)}…` : redacted;
}

/**
 * Builds the payload attached to a support request. Pure: `now` and `viewport`
 * are inputs, so the output is reproducible in tests.
 */
export function buildReportProblemPayload(input: ReportProblemInput): ReportProblemPayload {
  const now = input.now ?? new Date();
  const events = (input.events ?? [])
    .filter((event) => typeof event?.message === 'string' && event.message.length > 0)
    .slice(-MAX_REPORT_EVENTS)
    .map((event) => ({
      ...(event.at !== undefined ? { at: event.at } : {}),
      ...(event.level !== undefined ? { level: event.level } : {}),
      message: redactReportText(event.message).slice(0, MAX_EVENT_LENGTH),
    }));

  const payload: ReportProblemPayload = {
    schema: 1,
    route: normaliseRoute(input.route),
    timestamp: Number.isNaN(now.getTime()) ? new Date(0).toISOString() : now.toISOString(),
    events,
    client: { viewport: 'unknown' },
  };

  const requestId = clamp(input.requestId, 128);
  if (requestId) payload.requestId = requestId;

  const errorClass = clamp(input.errorClass, 64);
  if (errorClass) payload.errorClass = errorClass;

  const summary = clamp(input.summary, MAX_SUMMARY_LENGTH);
  if (summary) payload.summary = summary;

  return payload;
}

/**
 * A stable, human-reviewable issue title built from a payload. Subject is
 * lower-case and carries no trailing period so it also satisfies the
 * conventional-subject discipline used for commits and PR titles.
 */
export function buildReportIssueTitle(payload: ReportProblemPayload): string {
  const what = payload.summary ?? payload.route;
  const where = payload.errorClass ? `${payload.errorClass} on` : 'on';
  return `report a problem: ${where} ${what}`.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * GitHub issue-template URL with the payload in the body. Deliberately uses a
 * URL-encoded `body=` rather than a template form, so it works without a
 * repository-side template file.
 */
export function buildReportIssueUrl(
  payload: ReportProblemPayload,
  repo = 'SorobanCrashLab/soroban-crashlab',
): string {
  const title = buildReportIssueTitle(payload);
  const lines = [
    `Route: ${payload.route}`,
    `Request id: ${payload.requestId ?? 'n/a'}`,
    `Error class: ${payload.errorClass ?? 'n/a'}`,
    `Timestamp: ${payload.timestamp}`,
    '',
    payload.summary ? `What I saw: ${payload.summary}` : '',
    '',
    'Recent events:',
    ...(payload.events.length > 0
      ? payload.events.map((event) => `- [${event.level ?? 'info'}] ${event.at ?? 'n/a'} ${event.message}`)
      : ['- (none)']),
  ].filter((line) => line !== '');

  return `https://github.com/${repo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(lines.join('\n'))}`;
}
