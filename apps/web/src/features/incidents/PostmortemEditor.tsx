// WIP scaffold for issue #2286. Templates, action items, and follow-up tracking pending.
"use client";

import { useState } from "react";

export interface PostmortemDraft {
  rootCause: string;
  contributingFactors: string;
  correctiveActions: string;
}

export function PostmortemEditor({
  onSave,
}: {
  onSave: (draft: PostmortemDraft) => void;
}) {
  const [draft, setDraft] = useState<PostmortemDraft>({
    rootCause: "",
    contributingFactors: "",
    correctiveActions: "",
  });

  return (
    <form
      aria-label="Postmortem editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <textarea
        aria-label="Root cause"
        value={draft.rootCause}
        onChange={(event) => setDraft({ ...draft, rootCause: event.target.value })}
      />
      <button type="submit">Save</button>
    </form>
  );
}
