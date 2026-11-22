// WIP scaffold for issue #2285. Only curl generation is implemented; TypeScript/Rust/Python
// snippet generation is pending.
"use client";

import type { EndpointSummary } from "./EndpointCatalog";

export function generateCurlSnippet(endpoint: EndpointSummary, baseUrl: string): string {
  return `curl -X ${endpoint.method} "${baseUrl}${endpoint.path}" -H "Authorization: Bearer <token>"`;
}

export function SnippetGenerator({
  endpoint,
  baseUrl,
}: {
  endpoint: EndpointSummary | null;
  baseUrl: string;
}) {
  if (!endpoint) return null;

  return <pre aria-label="Code snippet">{generateCurlSnippet(endpoint, baseUrl)}</pre>;
}
