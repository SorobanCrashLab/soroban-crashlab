// WIP scaffold for issue #2286. TODO: replace with real data fetching + SSE updates.
"use client";

import { useState } from "react";

export type IncidentStatus = "detected" | "acknowledged" | "mitigating" | "resolved" | "postmortem";

export interface IncidentSummary {
  id: string;
  title: string;
  status: IncidentStatus;
  severity: "critical" | "high" | "medium" | "low";
  owner?: string;
}

export function useIncidents() {
  const [incidents, setIncidents] = useState<IncidentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  return { incidents, setIncidents, isLoading, setIsLoading };
}
