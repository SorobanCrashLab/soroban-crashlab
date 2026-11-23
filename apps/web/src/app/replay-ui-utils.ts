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

export type PlaybackSpeed = 0.25 | 0.5 | 1 | 2 | 4;

export interface ReplayFrame {
  runId: string;
  frame: number;
  instruction: number;
  timestampMs: number;
}

export interface ReplayBookmark {
  id: string;
  runId: string;
  frame: number;
  instruction: number;
  label: string;
}

export function formatFrameTime(frame: number, fps = 60): string {
  const safeFrame = Math.max(0, Math.floor(frame));
  const safeFps = Math.max(1, fps);
  const totalSeconds = safeFrame / safeFps;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const frames = Math.floor(safeFrame % safeFps);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

export function seekFrame(currentFrame: number, delta: number, totalFrames: number): number {
  const total = Math.max(0, Math.floor(totalFrames));
  return Math.min(total, Math.max(0, Math.floor(currentFrame) + Math.floor(delta)));
}

export function instructionToFrame(instruction: number, instructionsPerFrame = 1000): number {
  if (!Number.isFinite(instruction) || instruction < 0) return 0;
  return Math.floor(instruction / Math.max(1, instructionsPerFrame));
}

export function synchronizeReplayFrames(runs: Array<{ id: string; cpuInstructions?: number }>, fps = 60): ReplayFrame[] {
  return runs.map((run, index) => {
    const instruction = Math.max(0, Math.floor(run.cpuInstructions ?? 0));
    return { runId: run.id, frame: instructionToFrame(instruction, 1000), instruction, timestampMs: (index / Math.max(1, fps)) * 1000 };
  });
}

export function addReplayBookmark(
  bookmarks: ReplayBookmark[],
  bookmark: Omit<ReplayBookmark, 'id'>,
): ReplayBookmark[] {
  const id = `${bookmark.runId}:${bookmark.frame}:${bookmark.instruction}`;
  if (bookmarks.some((entry) => entry.id === id)) return bookmarks;
  return [...bookmarks, { ...bookmark, id }].sort((a, b) => a.frame - b.frame || a.instruction - b.instruction);
}

export function removeReplayBookmark(bookmarks: ReplayBookmark[], id: string): ReplayBookmark[] {
  return bookmarks.filter((bookmark) => bookmark.id !== id);
}

export function getNextPlaybackSpeed(current: PlaybackSpeed): PlaybackSpeed {
  const speeds: PlaybackSpeed[] = [0.25, 0.5, 1, 2, 4];
  const index = speeds.indexOf(current);
  return speeds[(index + 1) % speeds.length];
}
