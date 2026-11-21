// WIP scaffold for issue #2285. Timing/size display and tree view of response body pending.
"use client";

export interface ConsoleResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export function ResponseInspector({ response }: { response: ConsoleResponse | null }) {
  if (!response) {
    return <p aria-label="Response inspector">No response yet.</p>;
  }

  return (
    <div aria-label="Response inspector">
      <p>Status: {response.status}</p>
      <pre>{response.body}</pre>
    </div>
  );
}
