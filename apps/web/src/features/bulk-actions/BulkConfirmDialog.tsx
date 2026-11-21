// WIP scaffold for issue #2272. Dry-run preview rendering not implemented yet.
"use client";

import { useState } from "react";
import type { PreflightResult } from "./preflight/validators";

export function BulkConfirmDialog({
  preflight,
  requiresReason,
  onConfirm,
}: {
  preflight: PreflightResult;
  requiresReason: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  return (
    <div role="dialog" aria-modal="true" aria-label="Confirm bulk action">
      <p>{preflight.estimatedCount} items will be affected.</p>
      {preflight.ineligibleIds.length > 0 ? (
        <p>{preflight.ineligibleIds.length} items are ineligible and will be skipped.</p>
      ) : null}
      {requiresReason ? (
        <label>
          Reason
          <input value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
      ) : null}
      <button type="button" onClick={() => onConfirm(reason)} disabled={requiresReason && !reason}>
        Confirm
      </button>
    </div>
  );
}
