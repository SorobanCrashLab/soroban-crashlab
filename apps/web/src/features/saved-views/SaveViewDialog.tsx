// WIP scaffold for issue #2273. Tag input and ownership-transfer controls not implemented yet.
"use client";

import { useState } from "react";
import type { ViewScope } from "./viewSchema";

export function SaveViewDialog({
  onSave,
}: {
  onSave: (name: string, scope: ViewScope) => void;
}) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<ViewScope>("private");

  return (
    <form
      aria-label="Save view"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(name, scope);
      }}
    >
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        Scope
        <select value={scope} onChange={(event) => setScope(event.target.value as ViewScope)}>
          <option value="private">Private</option>
          <option value="team">Team</option>
          <option value="workspace">Workspace</option>
        </select>
      </label>
      <button type="submit">Save view</button>
    </form>
  );
}
