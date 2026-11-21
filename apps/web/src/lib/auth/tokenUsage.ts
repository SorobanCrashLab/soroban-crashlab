// WIP scaffold for issue #2275. No real request/error/rate-limit tracking wired up yet;
// this only defines the shape the usage dashboard expects.

export interface TokenUsageSummary {
  tokenId: string;
  requestCount: number;
  errorCount: number;
  rateLimitHits: number;
  lastUsedAt: string | null;
}

export function emptyUsageSummary(tokenId: string): TokenUsageSummary {
  return { tokenId, requestCount: 0, errorCount: 0, rateLimitHits: 0, lastUsedAt: null };
}
