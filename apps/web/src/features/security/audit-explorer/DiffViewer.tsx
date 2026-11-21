// WIP scaffold for issue #2284. Structured JSON/config diff rendering not implemented yet.
"use client";

export function DiffViewer({
  before,
  after,
}: {
  before: unknown;
  after: unknown;
}) {
  return (
    <div className="diff-viewer" aria-label="Before/after diff">
      <pre>{JSON.stringify(before, null, 2)}</pre>
      <pre>{JSON.stringify(after, null, 2)}</pre>
    </div>
  );
}
