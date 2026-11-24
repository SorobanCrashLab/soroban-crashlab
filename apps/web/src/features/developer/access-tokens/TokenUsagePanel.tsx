// WIP scaffold for issue #2275 — the net-new piece this issue asks for; token create/list/
// rotate/revoke already exist in apps/web/src/app/settings/api/ApiTokenManager.tsx.
"use client";

import type { TokenUsageSummary } from "@/lib/auth/tokenUsage";

export function TokenUsagePanel({ usage }: { usage: TokenUsageSummary }) {
  return (
    <dl aria-label="Token usage" className="token-usage-panel">
      <dt>Requests</dt>
      <dd>{usage.requestCount}</dd>
      <dt>Errors</dt>
      <dd>{usage.errorCount}</dd>
      <dt>Rate-limit hits</dt>
      <dd>{usage.rateLimitHits}</dd>
      <dt>Last used</dt>
      <dd>{usage.lastUsedAt ?? "Never"}</dd>
    </dl>
  );
}
