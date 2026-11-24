// WIP scaffold for issue #2285 (Developer API Console). TODO: render from
// /api/openapi (see apps/web/src/lib/openapi/spec.ts) instead of a static list.
"use client";

export interface EndpointSummary {
  method: string;
  path: string;
  summary?: string;
}

export function EndpointCatalog({
  endpoints,
  onSelect,
}: {
  endpoints: EndpointSummary[];
  onSelect: (endpoint: EndpointSummary) => void;
}) {
  return (
    <ul aria-label="API endpoint catalog" className="endpoint-catalog">
      {endpoints.map((endpoint) => (
        <li key={`${endpoint.method}-${endpoint.path}`}>
          <button type="button" onClick={() => onSelect(endpoint)}>
            <span>{endpoint.method}</span> <code>{endpoint.path}</code>
          </button>
        </li>
      ))}
    </ul>
  );
}
