// WIP scaffold for issue #2274. Field discovery/autocomplete for the deny-list pending.
"use client";

import { useState } from "react";
import type { RedactionProfile } from "@/lib/sharing/redaction";

export function RedactionProfileEditor({
  profile,
  onChange,
}: {
  profile: RedactionProfile;
  onChange: (next: RedactionProfile) => void;
}) {
  const [fieldInput, setFieldInput] = useState("");

  return (
    <div aria-label="Redaction profile editor">
      <p>{profile.name}</p>
      <ul>
        {profile.deniedFields.map((field) => (
          <li key={field}>{field}</li>
        ))}
      </ul>
      <input value={fieldInput} onChange={(event) => setFieldInput(event.target.value)} />
      <button
        type="button"
        onClick={() => {
          if (!fieldInput) return;
          onChange({ ...profile, deniedFields: [...profile.deniedFields, fieldInput] });
          setFieldInput("");
        }}
      >
        Add field
      </button>
    </div>
  );
}
