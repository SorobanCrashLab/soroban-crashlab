// WIP scaffold for issue #2272. No job polling/SSE wiring yet.
"use client";

import { useState } from "react";
import type { BulkJobProgress } from "../jobs/BulkJobClient";

export function useBulkActions() {
  const [activeJob, setActiveJob] = useState<BulkJobProgress | null>(null);

  return { activeJob, setActiveJob };
}
