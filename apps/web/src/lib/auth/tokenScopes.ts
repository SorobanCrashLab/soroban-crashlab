// WIP scaffold for issue #2275. Human-readable scope descriptions for the token console.
// Complements the scope *enforcement* already implemented in apps/web/src/lib/api-key-auth.ts.

export interface ScopeDescription {
  scope: string;
  label: string;
  description: string;
}

export const KNOWN_SCOPES: readonly ScopeDescription[] = [
  { scope: "*", label: "Full access", description: "Unrestricted read/write access." },
  { scope: "read", label: "Read-only", description: "Read access to all resources." },
  { scope: "write", label: "Read/write", description: "Read and write access to all resources." },
];

export function describeScope(scope: string): ScopeDescription {
  return (
    KNOWN_SCOPES.find((entry) => entry.scope === scope) ?? {
      scope,
      label: scope,
      description: "Unrecognized scope.",
    }
  );
}
