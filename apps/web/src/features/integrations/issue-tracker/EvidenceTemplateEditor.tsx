// WIP scaffold for issue #2283. Artifact/screenshot/log-excerpt attachment not
// implemented yet — plain text template only.
"use client";

export function EvidenceTemplateEditor({
  template,
  onChange,
}: {
  template: string;
  onChange: (template: string) => void;
}) {
  return (
    <textarea
      aria-label="Evidence template"
      value={template}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
