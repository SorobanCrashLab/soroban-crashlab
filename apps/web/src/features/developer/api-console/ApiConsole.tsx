// WIP scaffold for issue #2285 (Developer API Console). Not wired to a real OpenAPI feed or
// the execution proxy yet — see docs/developer/api-console.md.
"use client";

import { EndpointCatalog } from "./EndpointCatalog";
import { RequestBuilder } from "./RequestBuilder";
import { ResponseInspector } from "./ResponseInspector";
import { useApiConsole } from "./hooks/useApiConsole";

export function ApiConsole() {
  const { selectedEndpoint, setSelectedEndpoint, response } = useApiConsole();

  return (
    <div className="api-console" role="region" aria-label="Developer API console">
      <EndpointCatalog endpoints={[]} onSelect={setSelectedEndpoint} />
      <RequestBuilder endpoint={selectedEndpoint} onExecute={() => undefined} />
      <ResponseInspector response={response} />
    </div>
  );
}
