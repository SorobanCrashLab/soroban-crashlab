import { describe, it, expect, vi } from "vitest";
import {
  validateSlackWebhookUrl,
  createSlackAdapter,
  createRunEventMessage,
  createCriticalAlertMessage,
  createSimpleMessage,
  validateSlackBotToken,
  buildRunDetailPreviewBlocks,
} from "./slack-webhook";

describe("validateSlackWebhookUrl", () => {
  it("rejects an empty URL", () => {
    expect(validateSlackWebhookUrl("")).toContain("required");
  });

  it("rejects a non-Slack domain", () => {
    expect(validateSlackWebhookUrl("https://example.com/services/T/B/x")).toContain("domain");
  });

  it("rejects a Slack domain missing the webhook path", () => {
    expect(validateSlackWebhookUrl("https://hooks.slack.com/other/T/B/x")).toContain("path");
  });

  it("accepts a well-formed Slack webhook URL", () => {
    expect(validateSlackWebhookUrl("https://hooks.slack.com/services/T000/B000/xxxxxxxx")).toBeNull();
  });
});

describe("createSlackAdapter", () => {
  it("returns an error without calling fetch when the URL is invalid", async () => {
    const mockFetch = vi.fn();
    const adapter = createSlackAdapter({ fetchImpl: mockFetch });
    const result = await adapter.sendNotification({ webhookUrl: "" }, createSimpleMessage("hi"));
    expect(result.success).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns success on a 2xx response", async () => {
    const adapter = createSlackAdapter({
      fetchImpl: vi.fn(() => Promise.resolve({ ok: true } as Response)),
    });
    const result = await adapter.sendNotification(
      { webhookUrl: "https://hooks.slack.com/services/T/B/x" },
      createSimpleMessage("hi"),
    );
    expect(result.success).toBe(true);
  });

  it("surfaces the response body on a non-2xx response", async () => {
    const adapter = createSlackAdapter({
      fetchImpl: vi.fn(() =>
        Promise.resolve({ ok: false, status: 400, text: () => Promise.resolve("bad_payload") } as Response),
      ),
    });
    const result = await adapter.sendNotification(
      { webhookUrl: "https://hooks.slack.com/services/T/B/x" },
      createSimpleMessage("hi"),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("bad_payload");
  });
});

describe("createRunEventMessage / createCriticalAlertMessage", () => {
  it("includes the run id and event type", () => {
    const message = createRunEventMessage("failed", "run-42", { area: "auth" });
    expect(message.text).toContain("run-42");
    expect(message.attachments?.[0].fields?.some((f) => f.value === "run-42")).toBe(true);
  });

  it("builds a critical alert with metadata fields", () => {
    const message = createCriticalAlertMessage("Budget exceeded", "details here", { runId: "run-1" });
    expect(message.text).toContain("Budget exceeded");
    expect(message.attachments?.[0].fields?.some((f) => f.value === "run-1")).toBe(true);
  });
});

describe("validateSlackBotToken", () => {
  it("rejects an empty token", () => {
    expect(validateSlackBotToken("")).toContain("required");
  });

  it("rejects a token that isn't a bot token", () => {
    expect(validateSlackBotToken("xoxp-not-a-bot-token")).toContain("bot token");
  });

  it("accepts a well-formed bot token", () => {
    expect(validateSlackBotToken("xoxb-123-456-abc")).toBeNull();
  });
});

describe("postSlackMessage via adapter", () => {
  it("returns an error without calling fetch when the token is invalid", async () => {
    const mockFetch = vi.fn();
    const adapter = createSlackAdapter({ fetchImpl: mockFetch });
    const result = await adapter.postMessage({ botToken: "", channel: "C1" }, [], "fallback");
    expect(result.success).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns the message ts on success", async () => {
    const adapter = createSlackAdapter({
      fetchImpl: vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, ts: "1234.5678", channel: "C1" }),
        } as Response),
      ),
    });

    const result = await adapter.postMessage({ botToken: "xoxb-abc", channel: "C1" }, [], "fallback");
    expect(result.success).toBe(true);
    expect(result.ts).toBe("1234.5678");
  });

  it("includes thread_ts in the request body when replying to a thread", async () => {
    let capturedBody: string | undefined;
    const mockFetch = vi.fn((_url, init) => {
      capturedBody = init?.body as string;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, ts: "1234.9999", channel: "C1" }),
      } as Response);
    });
    const adapter = createSlackAdapter({ fetchImpl: mockFetch });

    await adapter.postMessage({ botToken: "xoxb-abc", channel: "C1" }, [], "fallback", "1234.5678");

    expect(capturedBody).toBeDefined();
    expect(JSON.parse(capturedBody as string).thread_ts).toBe("1234.5678");
  });

  it("returns an error when Slack's API reports ok: false", async () => {
    const adapter = createSlackAdapter({
      fetchImpl: vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: false, error: "channel_not_found" }),
        } as Response),
      ),
    });

    const result = await adapter.postMessage({ botToken: "xoxb-abc", channel: "C1" }, [], "fallback");
    expect(result.success).toBe(false);
    expect(result.error).toBe("channel_not_found");
  });

  it("returns an error when fetch throws", async () => {
    const adapter = createSlackAdapter({
      fetchImpl: vi.fn(() => Promise.reject(new Error("network down"))),
    });
    const result = await adapter.postMessage({ botToken: "xoxb-abc", channel: "C1" }, [], "fallback");
    expect(result.success).toBe(false);
    expect(result.error).toContain("network down");
  });
});

describe("buildRunDetailPreviewBlocks", () => {
  it("includes the core run fields", () => {
    const { blocks, fallbackText } = buildRunDetailPreviewBlocks({
      runId: "run-42",
      eventType: "completed",
      area: "auth",
      severity: "high",
      status: "completed",
      durationMs: 65_000,
    });

    const fieldsBlock = blocks.find((b) => b.fields);
    const fieldTexts = fieldsBlock?.fields?.map((f) => f.text).join(" ") ?? "";

    expect(fieldTexts).toContain("run-42");
    expect(fieldTexts).toContain("auth");
    expect(fieldTexts).toContain("high");
    expect(fieldTexts).toContain("1m 5s");
    expect(fallbackText).toContain("run-42");
  });

  it("includes the crash signature only when provided", () => {
    const withoutSignature = buildRunDetailPreviewBlocks({
      runId: "run-1",
      eventType: "completed",
      area: "state",
      severity: "low",
      status: "completed",
      durationMs: 500,
    });
    const withSignature = buildRunDetailPreviewBlocks({
      runId: "run-2",
      eventType: "failed",
      area: "state",
      severity: "critical",
      status: "failed",
      durationMs: 500,
      crashSignature: "budget::ResourceLimitExceeded",
    });

    const withoutText = withoutSignature.blocks.find((b) => b.fields)?.fields?.map((f) => f.text).join(" ") ?? "";
    const withText = withSignature.blocks.find((b) => b.fields)?.fields?.map((f) => f.text).join(" ") ?? "";

    expect(withoutText).not.toContain("Signature");
    expect(withText).toContain("budget::ResourceLimitExceeded");
  });

  it("adds a dashboard link block only when a dashboardUrl is provided", () => {
    const withUrl = buildRunDetailPreviewBlocks({
      runId: "run-3",
      eventType: "started",
      area: "xdr",
      severity: "medium",
      status: "running",
      durationMs: 0,
      dashboardUrl: "https://crashlab.example.com/runs/run-3",
    });
    const withoutUrl = buildRunDetailPreviewBlocks({
      runId: "run-4",
      eventType: "started",
      area: "xdr",
      severity: "medium",
      status: "running",
      durationMs: 0,
    });

    expect(withUrl.blocks.length).toBe(3);
    expect(withoutUrl.blocks.length).toBe(2);
    expect(JSON.stringify(withUrl.blocks)).toContain("https://crashlab.example.com/runs/run-3");
  });
});
