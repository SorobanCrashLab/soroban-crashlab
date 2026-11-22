/**
 * Tests for the Slack threaded-notification API route
 */

import { describe, it, expect, vi, beforeEach, afterAll, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { POST } from "./route";
import { resetSlackThreadStore } from "@/lib/integrations/slack-thread-store";

const TEST_DATA_DIR = path.join(process.cwd(), ".slack-thread-data");

function cleanupStoreFile() {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/integrations/slack", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function validRun(overrides: Record<string, unknown> = {}) {
  return {
    runId: "run-100",
    eventType: "started",
    area: "auth",
    severity: "high",
    status: "running",
    durationMs: 0,
    ...overrides,
  };
}

describe("POST /api/integrations/slack", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    cleanupStoreFile();
    resetSlackThreadStore();
  });

  afterEach(() => {
    cleanupStoreFile();
    resetSlackThreadStore();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns 503 when Slack credentials are not configured", async () => {
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_CHANNEL_ID;

    const response = await POST(makeRequest({ run: validRun() }));
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error).toContain("not configured");
  });

  it("returns 400 for invalid JSON body", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-abc";
    process.env.SLACK_CHANNEL_ID = "C1";

    const request = new Request("http://localhost/api/integrations/slack", {
      method: "POST",
      body: "not json",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 400 when the run payload is missing required fields", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-abc";
    process.env.SLACK_CHANNEL_ID = "C1";

    const response = await POST(makeRequest({ run: { runId: "run-1" } }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("run");
  });

  it("posts a new top-level message for the first event on a run", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-abc";
    process.env.SLACK_CHANNEL_ID = "C1";

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, ts: "1111.0001", channel: "C1" }),
      } as Response),
    );

    const response = await POST(makeRequest({ run: validRun() }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.success).toBe(true);
    expect(data.data.threaded).toBe(false);

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.thread_ts).toBeUndefined();
  });

  it("threads a second event for the same run under the first message", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-abc";
    process.env.SLACK_CHANNEL_ID = "C1";

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, ts: "2222.0001", channel: "C1" }),
      } as Response),
    );

    await POST(makeRequest({ run: validRun({ eventType: "started" }) }));

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, ts: "2222.0002", channel: "C1" }),
      } as Response),
    );

    const response = await POST(
      makeRequest({ run: validRun({ eventType: "completed", status: "completed" }) }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.threaded).toBe(true);

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.thread_ts).toBe("2222.0001");
  });

  it("returns 500 when Slack reports an API error", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-abc";
    process.env.SLACK_CHANNEL_ID = "C1";

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: false, error: "channel_not_found" }),
      } as Response),
    );

    const response = await POST(makeRequest({ run: validRun() }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("channel_not_found");
  });
});
