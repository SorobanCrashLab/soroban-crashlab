// WIP scaffold for issue #2285. Full JSON-schema tree rendering not implemented yet.
"use client";

export function SchemaViewer({ schema }: { schema: unknown }) {
  return (
    <pre aria-label="Schema viewer" className="schema-viewer">
      {JSON.stringify(schema, null, 2)}
    </pre>
  );
}
