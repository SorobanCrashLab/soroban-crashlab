// WIP scaffold for issue #2283. External-issue search/select and duplicate suggestions
// not implemented yet.
"use client";

import { useState } from "react";

export function LinkIssueDialog({
  onLink,
}: {
  onLink: (externalUrl: string) => void;
}) {
  const [externalUrl, setExternalUrl] = useState("");

  return (
    <form
      aria-label="Link existing issue"
      onSubmit={(event) => {
        event.preventDefault();
        onLink(externalUrl);
      }}
    >
      <label>
        Issue URL
        <input value={externalUrl} onChange={(event) => setExternalUrl(event.target.value)} />
      </label>
      <button type="submit">Link issue</button>
    </form>
  );
}
