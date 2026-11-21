// WIP scaffold for issue #2283. Evidence template population (crash summary, repro steps,
// artifacts) not implemented yet — plain title/body only.
"use client";

import { useState } from "react";

export function CreateIssueDialog({
  onCreate,
}: {
  onCreate: (title: string, body: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  return (
    <form
      aria-label="Create issue"
      onSubmit={(event) => {
        event.preventDefault();
        onCreate(title, body);
      }}
    >
      <label>
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        Body
        <textarea value={body} onChange={(event) => setBody(event.target.value)} />
      </label>
      <button type="submit">Create issue</button>
    </form>
  );
}
