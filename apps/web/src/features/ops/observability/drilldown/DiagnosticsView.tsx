// WIP scaffold for issue #2271. Deep links to logs/traces/webhook deliveries/failing jobs
// not implemented yet.
"use client";

export function DiagnosticsView({ failureMode }: { failureMode: string }) {
  return (
    <div aria-label="Diagnostics" className="diagnostics-view">
      <p>No diagnostics available yet for: {failureMode}</p>
    </div>
  );
}
