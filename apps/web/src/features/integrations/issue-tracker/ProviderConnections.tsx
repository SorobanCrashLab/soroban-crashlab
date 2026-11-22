// WIP scaffold for issue #2283. Auth/scope-check status not implemented yet.
"use client";

export interface ProviderConnection {
  provider: "github" | "jira" | "linear";
  connected: boolean;
}

export function ProviderConnections({ connections }: { connections: ProviderConnection[] }) {
  return (
    <ul aria-label="Issue tracker provider connections" className="provider-connections">
      {connections.map((connection) => (
        <li key={connection.provider}>
          {connection.provider}: {connection.connected ? "Connected" : "Not connected"}
        </li>
      ))}
    </ul>
  );
}
