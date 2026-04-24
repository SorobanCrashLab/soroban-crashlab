import { simulateSeedReplay } from "./replay";
import {
  createReplayPlaceholderRun,
  getReplayButtonLabel,
  ReplayActionData,
  ReplayButtonStatus,
} from "./replay-ui-utils";

describe("getReplayButtonLabel", () => {
  it("returns replay label for idle", () => {
    expect(getReplayButtonLabel("idle")).toBe("Replay");
  });

  it("returns replaying label for loading", () => {
    expect(getReplayButtonLabel("loading")).toBe("Replaying...");
  });

  it("returns queued label for success", () => {
    expect(getReplayButtonLabel("success")).toBe("Replay queued");
  });

  it("returns retry label for error", () => {
    expect(getReplayButtonLabel("error")).toBe("Retry replay");
  });

  it("maps all valid statuses without fallback gaps", () => {
    const statuses: ReplayButtonStatus[] = [
      "idle",
      "loading",
      "success",
      "error",
    ];
    const labels = statuses.map((status) => getReplayButtonLabel(status));
    expect(labels).toEqual([
      "Replay",
      "Replaying...",
      "Replay queued",
      "Retry replay",
    ]);
  });
});

describe("createReplayPlaceholderRun", () => {
  it("creates a running placeholder run from replay action data", () => {
    const data: ReplayActionData = { id: "replay-run-1", status: "running" };
    const run = createReplayPlaceholderRun(data);

    expect(run.id).toBe("replay-run-1");
    expect(run.status).toBe("running");
    expect(run.area).toBe("state");
    expect(run.severity).toBe("medium");
  });

  it("sets safe default metrics for placeholder run", () => {
    const run = createReplayPlaceholderRun({
      id: "replay-run-2",
      status: "running",
    });

    expect(run.duration).toBe(0);
    expect(run.seedCount).toBe(0);
    expect(run.cpuInstructions).toBe(0);
    expect(run.memoryBytes).toBe(0);
    expect(run.minResourceFee).toBe(0);
    expect(run.crashDetail).toBeNull();
  });
});

describe("integration: replay service to dashboard run mapping", () => {
  it("maps simulateSeedReplay output into a dashboard-compatible run", async () => {
    const replayResult = await simulateSeedReplay("run-42");
    const run = createReplayPlaceholderRun({
      id: replayResult.newRunId,
      status: "running",
    });

    expect(run.id.startsWith("replay-run-42-")).toBe(true);
    expect(run.status).toBe("running");
    expect(run.crashDetail).toBeNull();
    expect(run.area).toBe("state");
  });

  it("preserves run id exactly when injected from replay action callback", () => {
    const callbackPayload: ReplayActionData = {
      id: "replay-run-99-abc12345",
      status: "running",
    };

    const run = createReplayPlaceholderRun(callbackPayload);
    expect(run.id).toBe(callbackPayload.id);
  });
});
