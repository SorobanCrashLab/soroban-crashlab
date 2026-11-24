// WIP scaffold for issue #2274. Scope/redaction-profile selection UI not implemented yet.
"use client";

import { useState } from "react";
import type { SharePolicy } from "./policy";

export function ShareDialog({
  entityType,
  entityId,
  onCreate,
}: {
  entityType: SharePolicy["entityType"];
  entityId: string;
  onCreate: (policy: SharePolicy) => void;
}) {
  const [expiresAt, setExpiresAt] = useState<string>("");

  return (
    <form
      aria-label="Create share link"
      onSubmit={(event) => {
        event.preventDefault();
        onCreate({ entityType, entityId, expiresAt: expiresAt || null });
      }}
    >
      <label>
        Expires at
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={(event) => setExpiresAt(event.target.value)}
        />
      </label>
      <button type="submit">Create share link</button>
    </form>
  );
}
