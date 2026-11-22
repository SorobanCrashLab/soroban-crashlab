/**
 * Segment error-boundary messaging + PII scrubbing.
 *
 * Used by the shared <SegmentError /> fallback so every route family
 * (runs, analytics, triage, logs, settings, integrations, notification-center)
 * renders consistent, branded, coded copy.
 *
 * Tolerant of missing codes: the error-catalog work that maps machine codes
 * to friendly copy may lag new error sources, so unknown/missing codes fall
 * back to family-level defaults instead of showing a raw stack or code.
 */

export type SegmentFamily =
  | 'runs'
  | 'analytics'
  | 'triage'
  | 'logs'
  | 'settings'
  | 'integrations'
  | 'notification-center';

interface SegmentCopy {
  title: string;
  message: string;
}

const COPY: Record<SegmentFamily, SegmentCopy> = {
  runs: {
    title: 'Failed to load runs',
    message: 'This runs view could not be loaded. The rest of the app is unaffected.',
  },
  analytics: {
    title: 'Failed to load analytics',
    message: 'This analytics view could not be loaded. The rest of the app is unaffected.',
  },
  triage: {
    title: 'Failed to load triage',
    message: 'This triage view could not be loaded. The rest of the app is unaffected.',
  },
  logs: {
    title: 'Failed to load logs',
    message: 'This logs view could not be loaded. The rest of the app is unaffected.',
  },
  settings: {
    title: 'Failed to load settings',
    message: 'This settings view could not be loaded. The rest of the app is unaffected.',
  },
  integrations: {
    title: 'Failed to load integrations',
    message: 'This integrations view could not be loaded. The rest of the app is unaffected.',
  },
  'notification-center': {
    title: 'Failed to load notifications',
    message: 'The notification center could not be loaded. The rest of the app is unaffected.',
  },
};

/**
 * Coded messaging catalog. Keyed by an optional error code (e.g. error.code or
 * error.cause.code). Intentionally small and tolerant of gaps — unknown codes
 * fall back to the family defaults above.
 */
const CODED_MESSAGES: Record<string, string> = {
  RUNS_FETCH_FAILED: 'We could not fetch your runs. Check connectivity, then retry.',
  ANALYTICS_COMPUTE_FAILED: 'We could not compute analytics for this view.',
  TRIAGE_LOAD_FAILED: 'We could not load the triage board.',
  LOGS_FETCH_FAILED: 'We could not fetch logs for this view.',
  SETTINGS_LOAD_FAILED: 'We could not load these settings.',
  INTEGRATIONS_LOAD_FAILED: 'We could not load integrations.',
  NOTIFICATIONS_LOAD_FAILED: 'We could not load your notifications.',
};

/** Pull a machine code off an error if present, else undefined. */
export function extractErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const e = error as Record<string, unknown>;
  const cause = e.cause as Record<string, unknown> | undefined;
  const code = e.code ?? (cause ? cause.code : undefined);
  return typeof code === 'string' ? code : undefined;
}

/**
 * Scrub an error message for display per PII conventions:
 * no raw URLs, no email addresses, no obvious secrets/tokens.
 */
export function scrubErrorMessage(input: string): string {
  if (!input) return '';
  let out = input;
  // No raw URLs.
  out = out.replace(/https?:\/\/[^\s)<>"']+/gi, '[link removed]');
  // No email addresses.
  out = out.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email removed]');
  // No obvious secrets/tokens.
  out = out.replace(/gh[ps]_[A-Za-z0-9]{16,}/g, '[token removed]');
  out = out.replace(/sk_[A-Za-z0-9]{16,}/g, '[token removed]');
  out = out.replace(/AKIA[0-9A-Z]{16}/g, '[token removed]');
  out = out.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[token removed]');
  out = out.replace(/\b[0-9a-fA-F]{32,}\b/g, '[token removed]');
  return out.trim();
}

/** Resolve the copy to show for a given family + error. */
export function resolveSegmentErrorMessage(
  family: SegmentFamily,
  error: Error & { digest?: string },
): SegmentCopy {
  const base = COPY[family];
  const code = extractErrorCode(error);
  const coded = code ? CODED_MESSAGES[code] : undefined;
  return {
    title: base.title,
    message: coded ?? base.message,
  };
}
