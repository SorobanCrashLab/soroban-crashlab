// WIP scaffold for issue #2275. Resource-filter display and audit-trail linkage pending.
"use client";

import { describeScope } from "@/lib/auth/tokenScopes";
import { TokenUsagePanel } from "./TokenUsagePanel";
import type { TokenUsageSummary } from "@/lib/auth/tokenUsage";

export interface TokenDetailsData {
  id: string;
  name: string;
  scopes: string[];
  expiresAt: string | null;
}

export function TokenDetails({
  token,
  usage,
}: {
  token: TokenDetailsData;
  usage: TokenUsageSummary;
}) {
  return (
    <section aria-label={`Token ${token.name}`}>
      <h3>{token.name}</h3>
      <ul>
        {token.scopes.map((scope) => (
          <li key={scope}>{describeScope(scope).label}</li>
        ))}
      </ul>
      <p>Expires: {token.expiresAt ?? "Never"}</p>
      <TokenUsagePanel usage={usage} />
    </section>
  );
}
