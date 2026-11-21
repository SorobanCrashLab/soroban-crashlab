// WIP scaffold for issue #2285. TODO: fetch the real spec from /api/openapi and execute
// requests through the guarded proxy route.
"use client";

import { useState } from "react";
import type { EndpointSummary } from "../EndpointCatalog";
import type { ConsoleResponse } from "../ResponseInspector";

export function useApiConsole() {
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointSummary | null>(null);
  const [response, setResponse] = useState<ConsoleResponse | null>(null);

  return { selectedEndpoint, setSelectedEndpoint, response, setResponse };
}
