// WIP scaffold for issue #2285. Validation against the OpenAPI schema and example
// payloads are not implemented yet.
"use client";

import { useState } from "react";
import type { EndpointSummary } from "./EndpointCatalog";

export interface RequestDraft {
  headers: Record<string, string>;
  body: string;
}

export function RequestBuilder({
  endpoint,
  onExecute,
}: {
  endpoint: EndpointSummary | null;
  onExecute: (draft: RequestDraft) => void;
}) {
  const [body, setBody] = useState("");

  if (!endpoint) {
    return <p>Select an endpoint to build a request.</p>;
  }

  return (
    <form
      aria-label="Request builder"
      onSubmit={(event) => {
        event.preventDefault();
        onExecute({ headers: {}, body });
      }}
    >
      <p>
        {endpoint.method} {endpoint.path}
      </p>
      <textarea
        aria-label="Request body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      <button type="submit">Send</button>
    </form>
  );
}
