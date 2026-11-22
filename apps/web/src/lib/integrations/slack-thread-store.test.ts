import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { SlackThreadStore } from "./slack-thread-store";

const TEST_DATA_DIR = path.join(__dirname, "__test-slack-thread-data__");

function cleanup() {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
}

describe("SlackThreadStore", () => {
  afterEach(() => {
    cleanup();
  });

  it("returns undefined for a run that has no thread yet", () => {
    const store = new SlackThreadStore(path.join(TEST_DATA_DIR, "empty"));
    expect(store.getThread("run-1")).toBeUndefined();
  });

  it("persists a thread across store instances", () => {
    const dir = path.join(TEST_DATA_DIR, "persist");
    const store1 = new SlackThreadStore(dir);
    store1.setThread({
      runId: "run-1",
      channel: "C1",
      threadTs: "1111.0001",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const store2 = new SlackThreadStore(dir);
    const thread = store2.getThread("run-1");

    expect(thread).toBeDefined();
    expect(thread?.threadTs).toBe("1111.0001");
    expect(thread?.channel).toBe("C1");
  });

  it("overwrites the thread for a run when set again", () => {
    const dir = path.join(TEST_DATA_DIR, "overwrite");
    const store = new SlackThreadStore(dir);

    store.setThread({ runId: "run-1", channel: "C1", threadTs: "1", updatedAt: "2026-01-01T00:00:00.000Z" });
    store.setThread({ runId: "run-1", channel: "C1", threadTs: "2", updatedAt: "2026-01-02T00:00:00.000Z" });

    expect(store.getThread("run-1")?.threadTs).toBe("2");
  });

  it("deletes a thread and reports whether one existed", () => {
    const dir = path.join(TEST_DATA_DIR, "delete");
    const store = new SlackThreadStore(dir);

    expect(store.deleteThread("run-1")).toBe(false);

    store.setThread({ runId: "run-1", channel: "C1", threadTs: "1", updatedAt: "2026-01-01T00:00:00.000Z" });
    expect(store.deleteThread("run-1")).toBe(true);
    expect(store.getThread("run-1")).toBeUndefined();
  });

  it("recovers gracefully from a corrupt data file", () => {
    const dir = path.join(TEST_DATA_DIR, "corrupt");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "slack-run-threads.json"), "{not valid json", "utf-8");

    const store = new SlackThreadStore(dir);
    expect(store.getThread("run-1")).toBeUndefined();
  });

  it("keeps threads for different runs independent", () => {
    const dir = path.join(TEST_DATA_DIR, "multi");
    const store = new SlackThreadStore(dir);

    store.setThread({ runId: "run-1", channel: "C1", threadTs: "1", updatedAt: "2026-01-01T00:00:00.000Z" });
    store.setThread({ runId: "run-2", channel: "C1", threadTs: "2", updatedAt: "2026-01-01T00:00:00.000Z" });

    expect(store.getThread("run-1")?.threadTs).toBe("1");
    expect(store.getThread("run-2")?.threadTs).toBe("2");
  });
});
