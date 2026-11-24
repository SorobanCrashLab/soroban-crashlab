// WIP scaffold for issue #2275. TODO: fetch real data from /api/settings/tokens (existing
// CRUD) and /api/tokens/[id]/usage (new, stubbed) instead of local-only state.
"use client";

import { useState } from "react";
import type { TokenUsageSummary } from "@/lib/auth/tokenUsage";

export function useAccessTokens() {
  const [usageByToken, setUsageByToken] = useState<Record<string, TokenUsageSummary>>({});
  const [isLoading, setIsLoading] = useState(false);

  return { usageByToken, setUsageByToken, isLoading, setIsLoading };
}
