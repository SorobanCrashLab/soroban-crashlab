import type { FuzzingRun } from "./types";

export type ReplayActionData = { id: string; status: "running" };

export function createReplayPlaceholderRun(data: ReplayActionData): FuzzingRun {
  return {
    id: data.id,
    status: "running",
    area: "state",
    severity: "medium",
    duration: 0,
    seedCount: 0,
    crashDetail: null,
    cpuInstructions: 0,
    memoryBytes: 0,
    minResourceFee: 0,
  };
}

export type ReplayButtonStatus = "idle" | "loading" | "success" | "error";

export function getReplayButtonLabel(status: ReplayButtonStatus): string {
  switch (status) {
    case "loading":
      return "Replaying...";
    case "success":
      return "Replay queued";
    case "error":
      return "Retry replay";
    default:
      return "Replay";
  }
}
