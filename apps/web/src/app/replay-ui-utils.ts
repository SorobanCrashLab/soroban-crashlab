import type { FuzzingRun } from "./types";

export type ReplayActionData = {
  id: string;
  status: "running";
  parentId?: string;
  seedList?: number[];
};

export function createReplayPlaceholderRun(data: ReplayActionData): FuzzingRun {
  return {
    id: data.id,
    parentId: data.parentId,
    seedList: data.seedList,
    status: "running",
    area: "state",
    severity: "medium",
    duration: 0,
    seedCount: data.seedList?.length ?? 0,
    crashDetail: null,
    cpuInstructions: 0,
    memoryBytes: 0,
    minResourceFee: 0,
  };
}

export function getRunLineageLabel(run: Pick<FuzzingRun, "parentId" | "seedList">): string {
  if (!run.parentId) {
    return "root run";
  }

  const count = Array.isArray(run.seedList) ? run.seedList.length : 0;
  return `child of #${run.parentId.replace(/\D+/, '')} · ${count} seed${count === 1 ? '' : 's'}`;
}

export function getRunLineagePath(
  run: Pick<FuzzingRun, "id" | "parentId">,
  runs: Array<Pick<FuzzingRun, "id" | "parentId">>,
): string[] {
  const lookup = new Map(runs.map((entry) => [entry.id, entry]));
  const path: string[] = [];
  const visited = new Set<string>();

  let current: Pick<FuzzingRun, "id" | "parentId"> | undefined = run;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.push(current.id);
    const currentParentId: string | undefined = current.parentId;
    const nextParent: Pick<FuzzingRun, "id" | "parentId"> | undefined = currentParentId
      ? (lookup.get(currentParentId) as Pick<FuzzingRun, "id" | "parentId"> | undefined)
      : undefined;
    current = nextParent;
  }

  return path.reverse();
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
