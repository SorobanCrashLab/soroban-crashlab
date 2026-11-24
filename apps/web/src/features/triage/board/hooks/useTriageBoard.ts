// WIP scaffold for issue #2282. TODO: replace with real data fetching (SWR/React Query + SSE).
"use client";

import { useState } from "react";
import type { TriageCardData } from "../cards/TriageCard";

export function useTriageBoard() {
  const [items, setItems] = useState<TriageCardData[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  return { items, setItems, isLoading, setIsLoading };
}
