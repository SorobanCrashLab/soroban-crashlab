// WIP scaffold for issue #2275. The overlap/grace-window option here is new; a simpler
// immediate rotate already exists in ApiTokenManager.tsx and is unaffected by this.
"use client";

import { useState } from "react";

export function RotateTokenDialog({
  onRotate,
}: {
  onRotate: (overlapMinutes: number) => void;
}) {
  const [overlapMinutes, setOverlapMinutes] = useState(60);

  return (
    <form
      aria-label="Rotate token"
      onSubmit={(event) => {
        event.preventDefault();
        onRotate(overlapMinutes);
      }}
    >
      <label>
        Overlap window (minutes)
        <input
          type="number"
          min={0}
          value={overlapMinutes}
          onChange={(event) => setOverlapMinutes(Number(event.target.value))}
        />
      </label>
      <button type="submit">Rotate</button>
    </form>
  );
}
